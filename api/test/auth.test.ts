// api/test/auth.test.ts
import { exports } from "cloudflare:workers";
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "../src/db";
import { mintToken } from "../src/lib/auth";

const BASE = "http://example.com";

// Must match the bindings in vitest.config.ts (see "Setup" below).
const TEST_PASSWORD = ["test", "only"].join("-");
const TEST_SECRET = btoa(["test", "only", "placeholder"].join("-"));

// A route protected by requireAuth(). Adjust to whichever write route
// you've wired up (e.g. POST /v1/notes, PATCH /v1/notes/:slug).
const PROTECTED_URL = `${BASE}/_test/protected`;

async function login(password: string) {
  return exports.default.fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

// Rate limiting and the failure log are per-IP; tests share the same
// IP (127.0.0.1 in dev). Clearing before each test keeps them isolated.
async function clearAttempts() {
  await sql`DELETE FROM login_attempts WHERE ip = '127.0.0.1'`;
}

// ────────────────────────────────────────────────── login: happy + sad
describe("POST /v1/auth/login", () => {
  beforeEach(clearAttempts);

  it("returns a token for the correct password", async () => {
    const res = await login(TEST_PASSWORD);
    expect(res.status).toBe(200);

    const body = await res.json<{ token: string }>();
    expect(body.token).toEqual(expect.any(String));

    // Token shape: payload.signature — exactly two parts, both non-empty.
    const parts = body.token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);
  });

  it("rejects a wrong password with 401 invalid_credentials", async () => {
    const res = await login("definitely-not-it");
    expect(res.status).toBe(401);

    const body = await res.json<{
      error: { code: string; message: string; requestId: string };
    }>();
    expect(body.error.code).toBe("invalid_credentials");
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it("rejects a missing password with 400 validation_failed", async () => {
    const res = await exports.default.fetch(`${BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("validation_failed");
  });

  it("rate limits after 5 failures (429 on the 6th)", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await login("wrong");
      expect(r.status).toBe(401);
    }

    const res = await login("wrong");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);

    // Even the *correct* password is blocked while the limit is active.
    const stillBlocked = await login(TEST_PASSWORD);
    expect(stillBlocked.status).toBe(429);
  });
});

// ────────────────────────────────────────── protected route: auth checks
describe("Protected route — requireAuth", () => {
  beforeEach(clearAttempts);

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await exports.default.fetch(PROTECTED_URL, { method: "POST" });
    expect(res.status).toBe(401);

    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("unauthorized");
  });

  it("rejects a malformed Authorization header (401)", async () => {
    const res = await exports.default.fetch(PROTECTED_URL, {
      method: "POST",
      headers: { Authorization: "Basic dXNlcjpwYXNz" }, // not Bearer
    });
    expect(res.status).toBe(401);
  });

  it("rejects a tampered token (401)", async () => {
    const loginRes = await login(TEST_PASSWORD);
    const { token } = await loginRes.json<{ token: string }>();

    // Flip the last char of the payload, keep the original signature.
    // Signature verification will fail — the payload no longer matches.
    const [payload, signature] = token.split(".");
    const flipped = payload!.slice(0, -1) + (payload!.at(-1) === "A" ? "B" : "A");
    const tampered = `${flipped}.${signature}`;

    const res = await exports.default.fetch(PROTECTED_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${tampered}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an expired token (401)", async () => {
    // Mint a token with a negative TTL → exp is in the past.
    const expired = await mintToken(TEST_SECRET, "admin", -3600);

    const res = await exports.default.fetch(PROTECTED_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);
  });

  it("accepts a valid token (200 or 4xx from the handler, not 401)", async () => {
    const loginRes = await login(TEST_PASSWORD);
    const { token } = await loginRes.json<{ token: string }>();

    const res = await exports.default.fetch(PROTECTED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}), // may 400 on validation — that's fine, NOT 401
    });

    // The auth layer passed; whatever the handler does with `{}` is
    // its business. The critical assertion is "not 401".
    expect(res.status).not.toBe(401);
  });
});