// Generates a VAPID key pair for Web Push, in the exact base64url encoding the
// worker expects (see ../web-push.js):
//   VAPID_PUBLIC_KEY  — 65-byte uncompressed P-256 point
//   VAPID_PRIVATE_KEY — 32-byte private scalar (JWK "d")
//
// Uses only Node's built-in WebCrypto — no dependencies, and no name clash with
// the sibling web-push.js (running `npx web-push` from cloudflare-worker/ would
// resolve to that file on Windows and fail). Run from anywhere:
//
//   node cloudflare-worker/scripts/gen-vapid.mjs
//
// Then set the two keys as worker secrets and expose the PUBLIC key to the app:
//   npx wrangler secret put VAPID_PUBLIC_KEY
//   npx wrangler secret put VAPID_PRIVATE_KEY
//   # .env.local:  VITE_VAPID_PUBLIC_KEY=<public key>
import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const pair = await subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const publicKey = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
const jwk = await subtle.exportKey("jwk", pair.privateKey);

console.log("VAPID_PUBLIC_KEY  =", b64url(publicKey));
console.log("VAPID_PRIVATE_KEY =", jwk.d);
