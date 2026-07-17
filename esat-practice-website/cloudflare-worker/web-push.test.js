import { describe, it, expect, vi, afterEach } from "vitest";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  buildVapidAuthHeader,
  sendPushNotification,
} from "./web-push.js";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    publicKey: bytesToBase64Url(rawPublic),
    privateKey: jwk.d, // already base64url of the 32-byte scalar
    subject: "mailto:test@example.com",
    verifyKey: pair.publicKey,
  };
}

async function generateClientSubscription() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    subscription: {
      endpoint: "https://push.example.com/subscription-id",
      keys: { p256dh: bytesToBase64Url(rawPublic), auth: bytesToBase64Url(auth) },
    },
    privateKey: pair.privateKey,
  };
}

// --- Independent receiver-side decrypt (RFC 8291 / RFC 8188 aes128gcm) -----
//
// Deliberately re-derived from the spec text rather than reusing anything from
// web-push.js: this is what proves the shipped encryptPayload() is actually
// interoperable, as opposed to merely self-consistent with its own bugs. A
// swapped key_info order or a missing "\0" terminator would make this fail to
// authenticate/decrypt even though web-push.js's own tests all pass.

async function hkdfBits(saltBytes, ikmBytes, infoBytes, lengthBytes) {
  const key = await crypto.subtle.importKey("raw", ikmBytes, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: saltBytes, info: infoBytes },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

async function decryptAes128gcm(body, receiverPrivateKey, receiverPublicRaw, authSecretBytes) {
  const salt = body.slice(0, 16);
  const idLen = body[20];
  const senderPublicRaw = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);

  const senderPublicKey = await crypto.subtle.importKey(
    "raw",
    senderPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: senderPublicKey }, receiverPrivateKey, 256),
  );

  const enc = new TextEncoder();
  const keyInfo = new Uint8Array([
    ...enc.encode("WebPush: info\0"),
    ...receiverPublicRaw,
    ...senderPublicRaw,
  ]);
  const ikm = await hkdfBits(authSecretBytes, ecdhSecret, keyInfo, 32);
  const cek = await hkdfBits(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfBits(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["decrypt"]);
  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aesKey, ciphertext),
  );
  // Strip the single-record 0x02 delimiter (RFC 8188 §2 last record).
  return decrypted.slice(0, -1);
}

describe("base64url helpers", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(70));
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });

  it("produces url-safe output without padding", () => {
    const encoded = bytesToBase64Url(new Uint8Array([251, 255, 191]));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("buildVapidAuthHeader", () => {
  it("produces a verifiable ES256 JWT with the right claims", async () => {
    const vapid = await generateVapidKeys();
    const header = await buildVapidAuthHeader("https://push.example.com/foo/bar", vapid);

    expect(header).toMatch(/^vapid t=.+, k=.+$/);
    const match = /^vapid t=(.+), k=(.+)$/.exec(header);
    const [jwt, k] = [match[1], match[2]];
    expect(k).toBe(vapid.publicKey);

    const [encHeader, encPayload, encSig] = jwt.split(".");
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encPayload)));
    expect(payload.aud).toBe("https://push.example.com");
    expect(payload.sub).toBe(vapid.subject);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      vapid.verifyKey,
      base64UrlToBytes(encSig),
      new TextEncoder().encode(`${encHeader}.${encPayload}`),
    );
    expect(valid).toBe(true);
  });
});

describe("sendPushNotification", () => {
  it("POSTs an encrypted aes128gcm payload with VAPID auth", async () => {
    const vapid = await generateVapidKeys();
    const { subscription } = await generateClientSubscription();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    global.fetch = fetchMock;

    const res = await sendPushNotification(subscription, JSON.stringify({ title: "Hi" }), vapid);
    expect(res.status).toBe(201);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(subscription.endpoint);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(init.headers["Content-Type"]).toBe("application/octet-stream");
    expect(init.headers.Authorization).toMatch(/^vapid t=/);
    expect(init.headers.TTL).toBe(String(24 * 60 * 60));

    // salt(16) + rs(4) + idlen(1) + as_public(65) + ciphertext(>=17)
    const body = new Uint8Array(init.body);
    expect(body.length).toBeGreaterThan(16 + 4 + 1 + 65);
    expect(body[16 + 4]).toBe(65); // key id length byte
  });

  it("produces a ciphertext a real receiver can decrypt back to the exact plaintext", async () => {
    // This is the test the shape-only assertions above can't provide: it proves
    // interoperability, not just "well-formed request". A bug in HKDF info-string
    // ordering, a missing null terminator, or swapped public keys would make
    // web-push.js's own tests keep passing while this one fails to authenticate.
    const vapid = await generateVapidKeys();
    const { subscription, privateKey } = await generateClientSubscription();
    const receiverPublicRaw = base64UrlToBytes(subscription.keys.p256dh);
    const authSecretBytes = base64UrlToBytes(subscription.keys.auth);
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));

    const plaintext = "When I grow up, I want to be a watermelon";
    await sendPushNotification(subscription, plaintext, vapid);

    const body = new Uint8Array(global.fetch.mock.calls[0][1].body);
    const decrypted = await decryptAes128gcm(body, privateKey, receiverPublicRaw, authSecretBytes);
    expect(new TextDecoder().decode(decrypted)).toBe(plaintext);
  });

  it("decrypt helper matches the official RFC 8291 §5 known-answer vector", async () => {
    // Independent confirmation that decryptAes128gcm itself (and therefore the
    // spec understanding shared with encryptPayload) is correct — not just
    // self-consistent — using the IETF's own fixed keys/salt/ciphertext/plaintext.
    const receiverPublicRaw = base64UrlToBytes(
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    );
    const receiverPrivateD = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
    const authSecretBytes = base64UrlToBytes("BTBZMqHH6r4Tts7J_aSIgg");
    const bodyB64Url =
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
      "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
      "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";
    // Note: RFC 8291 §5's header block states Content-Length: 145, but the
    // printed example body itself decodes to 144 bytes — a known inconsistency
    // in the RFC text, confirmed independently (python's base64.urlsafe_b64decode
    // agrees with our own decoder). Not asserting on it; the plaintext match below
    // is the real proof.
    const body = base64UrlToBytes(bodyB64Url);

    const receiverPrivateKey = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        d: receiverPrivateD,
        x: bytesToBase64Url(receiverPublicRaw.slice(1, 33)),
        y: bytesToBase64Url(receiverPublicRaw.slice(33, 65)),
        ext: true,
      },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );

    const decrypted = await decryptAes128gcm(body, receiverPrivateKey, receiverPublicRaw, authSecretBytes);
    expect(new TextDecoder().decode(decrypted)).toBe("When I grow up, I want to be a watermelon");
  });
});
