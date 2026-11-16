// api/src/lib/auth.ts
//
// Hand-rolled HMAC-SHA256 tokens. No JWT library — Web Crypto is built in.
//
// Token format:
//   base64url(payloadJson) + "." + base64url(HMAC-SHA256(secret, payloadJson))
//
// Payload: { sub, iat, exp }
//   sub — subject (who the token is for; you have one user: "admin")
//   iat — issued-at, Unix seconds
//   exp — expiry, Unix seconds
//
// 30-day default TTL (configurable per mint call).
//
// Security notes:
//   - Signatures are verified with crypto.subtle.verify, which does
//     constant-time comparison. Do NOT replace it with `===` on strings —
//     that leaks timing information and lets an attacker guess the
//     signature byte by byte.
//   - AUTH_SECRET is expected to be base64 (that's what
//     `openssl rand -base64 32` produces). It is decoded into 32 raw
//     bytes before being used as HMAC key material. If you change the
//     encoding, all existing tokens become invalid — minted and verified
//     must agree.
//   - verifyToken returns null on ANY failure (bad shape, bad signature,
//     malformed payload, expired). The caller (requireAuth middleware)
//     should not distinguish these cases in its response — the
//     distinction leaks information.

import { Context } from "hono";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export type TokenPayload = {
  sub: string;
  iat: number;
  exp: number;
};

// ─── base64url ─────────────────────────────────────────────────────
//
// btoa/atob are the browser-style base64 globals (available in Workers).
// We wrap them to (a) produce URL-safe output, and (b) accept both
// base64 and base64url as input, since AUTH_SECRET is standard base64
// but the token payload/signature are base64url.

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  // Normalize base64url → base64 (no-op for standard base64 input),
  // strip any existing padding, then add the correct amount back.
  const normalized = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/=+$/, '');
  const pad = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + '='.repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── HMAC-SHA256 ───────────────────────────────────────────────────

async function getHmacKey(secret: string): Promise<CryptoKey> {
  // AUTH_SECRET is base64-encoded (from `openssl rand -base64 32`).
  // Decode to raw bytes before using as HMAC key material — otherwise
  // you'd be signing with ~44 ASCII chars instead of the intended 32
  // random bytes.
  const keyBytes = base64urlDecode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false, // non-extractable
    ['sign', 'verify']
  );
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, TEXT_ENCODER.encode(data));
  return new Uint8Array(sig);
}

async function hmacVerify(
  secret: string,
  data: string,
  signature: Uint8Array
): Promise<boolean> {
  const key = await getHmacKey(secret);
  return crypto.subtle.verify('HMAC', key, signature, TEXT_ENCODER.encode(data));
}

// ─── public API ────────────────────────────────────────────────────

/**
 * Mint a signed token for `sub` (typically "admin").
 * Called by POST /v1/auth/login after the password check succeeds.
 */
export async function mintToken(
  secret: string,
  sub: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub,
    iat: now,
    exp: now + ttlSeconds,
  };

  const payloadB64 = base64urlEncode(
    TEXT_ENCODER.encode(JSON.stringify(payload))
  );
  const signature = await hmacSign(secret, payloadB64);
  const signatureB64 = base64urlEncode(signature);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verify a token's signature and expiry.
 * Called by the requireAuth middleware.
 *
 * Returns the decoded payload on success, or null on any failure.
 * Do not distinguish failure modes in the caller's response.
 */
export async function verifyToken(
  secret: string,
  token: string
): Promise<TokenPayload | null> {
  // Shape check first, before any crypto.
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;
  if (!payloadB64 || !signatureB64) return null;

  // Decode the signature (may throw on invalid base64).
  let signature: Uint8Array;
  try {
    signature = base64urlDecode(signatureB64);
  } catch {
    return null;
  }

  // Constant-time signature check — the security-critical step.
  let signatureOk: boolean;
  try {
    signatureOk = await hmacVerify(secret, payloadB64, signature);
  } catch {
    // Bad secret (e.g., not base64) or importKey failure.
    return null;
  }
  if (!signatureOk) return null;

  // Only parse the payload *after* the signature is verified — never
  // trust unverified input, even for reads like `.exp`.
  let payload: TokenPayload;
  try {
    const json = TEXT_DECODER.decode(base64urlDecode(payloadB64));
    payload = JSON.parse(json);
  } catch {
    return null;
  }

  // Structural validation. JSON.parse can return non-objects
  // (numbers, strings, null), so guard before touching fields.
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.sub !== 'string' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }

  // Expiry check.
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  return payload;
}



export function getClientIp(c: Context): string {
  // Cloudflare always sets CF-Connecting-IP to the real client IP,
  // overwriting any client-supplied value. Trust this one.
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-real-ip') ??          // some proxies
    '127.0.0.1'                            // local dev fallback
  );
}

export async function constantTimeEqual(a: string, b: string, key: string): Promise<boolean> {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(a));
  return crypto.subtle.verify('HMAC', k, sig, new TextEncoder().encode(b));
}