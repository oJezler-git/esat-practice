// Dependency-free Web Push (RFC 8291 aes128gcm payload + RFC 8292 VAPID) built on
// the WebCrypto API available in the Cloudflare Workers runtime. No npm packages,
// matching the rest of this worker.
//
// Subscriptions look like the browser's PushSubscription.toJSON():
//   { endpoint, keys: { p256dh, auth } }
// where p256dh is the client's uncompressed P-256 public key (65 bytes, base64url)
// and auth is a 16-byte secret (base64url).

// --- base64url helpers -----------------------------------------------------

export function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes) {
  let binary = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const utf8 = (s) => new TextEncoder().encode(s);

// --- VAPID JWT (RFC 8292) --------------------------------------------------

// The VAPID public key is an uncompressed P-256 point: 0x04 || X(32) || Y(32).
function publicKeyToJwk(publicKeyBytes) {
  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 0x04) {
    throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(publicKeyBytes.slice(1, 33)),
    y: bytesToBase64Url(publicKeyBytes.slice(33, 65)),
  };
}

async function importVapidSigningKey(publicKeyBytes, privateKeyBytes) {
  const jwk = {
    ...publicKeyToJwk(publicKeyBytes),
    d: bytesToBase64Url(privateKeyBytes),
    ext: true,
  };
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

// Returns the `Authorization: vapid ...` header value for a given push endpoint.
export async function buildVapidAuthHeader(endpoint, vapid) {
  const publicKeyBytes = base64UrlToBytes(vapid.publicKey);
  const privateKeyBytes = base64UrlToBytes(vapid.privateKey);
  const audience = new URL(endpoint).origin;

  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: vapid.subject,
  };

  const signingInput =
    bytesToBase64Url(utf8(JSON.stringify(header))) +
    "." +
    bytesToBase64Url(utf8(JSON.stringify(payload)));

  const key = await importVapidSigningKey(publicKeyBytes, privateKeyBytes);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      utf8(signingInput),
    ),
  );
  const jwt = signingInput + "." + bytesToBase64Url(signature);
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

// --- Payload encryption (RFC 8291 / RFC 8188 aes128gcm) --------------------

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function encryptPayload(plaintext, clientPublicKeyBytes, authSecret) {
  // Ephemeral (application server) ECDH key pair.
  const asKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const asPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeyPair.publicKey),
  );

  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  // Combine ecdh_secret with the auth secret (RFC 8291 §3.4).
  const keyInfo = concatBytes(
    utf8("WebPush: info\0"),
    clientPublicKeyBytes,
    asPublicRaw,
  );
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    utf8("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // Single record: plaintext followed by the 0x02 padding delimiter.
  const record = concatBytes(plaintext, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      record,
    ),
  );

  // aes128gcm header: salt(16) || rs(4) || idlen(1) || keyid(as_public) || ciphertext
  // rs is the record size: the encrypted record is the plaintext+delimiter plus
  // the 16-byte GCM tag. A single record fits well under any push service's cap.
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, record.length + 16, false);
  return concatBytes(
    salt,
    recordSize,
    new Uint8Array([asPublicRaw.length]),
    asPublicRaw,
    ciphertext,
  );
}

// --- Public send -----------------------------------------------------------

// Sends a push message. `payload` is a string (JSON). `vapid` is
// { publicKey, privateKey, subject } with base64url keys. Returns the fetch
// Response; callers should treat 404/410 as "subscription gone, delete it".
export async function sendPushNotification(subscription, payload, vapid, ttl = 24 * 60 * 60) {
  const clientPublicKey = base64UrlToBytes(subscription.keys.p256dh);
  const authSecret = base64UrlToBytes(subscription.keys.auth);
  const body = await encryptPayload(utf8(payload), clientPublicKey, authSecret);
  const authHeader = await buildVapidAuthHeader(subscription.endpoint, vapid);

  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
    },
    body,
  });
}
