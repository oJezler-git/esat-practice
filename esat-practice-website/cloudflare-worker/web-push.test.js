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
    endpoint: "https://push.example.com/subscription-id",
    keys: { p256dh: bytesToBase64Url(rawPublic), auth: bytesToBase64Url(auth) },
  };
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
    const subscription = await generateClientSubscription();
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
});
