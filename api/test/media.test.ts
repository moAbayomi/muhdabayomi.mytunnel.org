import { exports, env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "../src/db";

const BASE = "http://example.com";
const TEST_PASSWORD = ["test", "only"].join("-");
const MAX_BYTES = 10 * 1024 * 1024;

let token = "";

// A real 1x1 transparent PNG — valid magic bytes, tiny.
const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (ch) => ch.charCodeAt(0),
);

async function authed(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  // FormData sets its own multipart boundary; overriding it breaks parsing.
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${token}`);

  return exports.default.fetch(`${BASE}${path}`, { ...init, headers });
}

function pngUpload(name = "pixel.png", alt = "TEST pixel"): FormData {
  const form = new FormData();
  form.append("file", new File([PNG_1X1], name, { type: "image/png" }));
  form.append("alt", alt);
  return form;
}

/** Remove rows and objects created by these tests (alt is the marker). */
async function cleanupMedia() {
  const rows = (await sql`
    SELECT r2_key FROM media WHERE alt LIKE 'TEST%'
  `) as { r2_key: string }[];

  for (const row of rows) {
    await env.MEDIA_BUCKET.delete(row.r2_key);
  }
  await sql`DELETE FROM media WHERE alt LIKE 'TEST%'`;
}

beforeAll(async () => {
  await cleanupMedia();

  const res = await exports.default.fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  });
  token = (await res.json<{ token: string }>()).token;
});

afterAll(cleanupMedia);

describe("admin media auth", () => {
  it("rejects an unauthenticated upload", async () => {
    const res = await exports.default.fetch(`${BASE}/v1/admin/media`, {
      method: "POST",
      body: pngUpload(),
    });
    expect(res.status).toBe(401);
  });
});

describe("upload", () => {
  it("accepts a real PNG and stores it under YYYY/MM", async () => {
    const res = await authed("/v1/admin/media", {
      method: "POST",
      body: pngUpload(),
    });

    expect(res.status).toBe(201);

    const media = await res.json<{
      id: string;
      r2_key: string;
      url: string;
      mime: string;
      bytes: number;
      alt: string;
    }>();

    expect(media.mime).toBe("image/png");
    expect(media.r2_key).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    expect(media.url).toBe(`/v1/media/${media.r2_key}`);
    expect(media.bytes).toBe(PNG_1X1.length);
    expect(media.alt).toBe("TEST pixel");
  });

  it("rejects a text file renamed to .png (magic bytes, not extension)", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File([new TextEncoder().encode("this is not an image")], "fake.png", {
        type: "image/png",
      }),
    );
    form.append("alt", "TEST fake");

    const res = await authed("/v1/admin/media", { method: "POST", body: form });
    expect(res.status).toBe(415);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe(
      "unsupported_type",
    );
  });

  it("rejects a file over 10 MB with 413", async () => {
    const big = new Uint8Array(MAX_BYTES + 1024);
    big.set(PNG_1X1); // valid magic, but size must win

    const form = new FormData();
    form.append("file", new File([big], "big.png", { type: "image/png" }));
    form.append("alt", "TEST big");

    const res = await authed("/v1/admin/media", { method: "POST", body: form });
    expect(res.status).toBe(413);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe(
      "file_too_large",
    );
  });
});

describe("serve", () => {
  it("serves the uploaded object with immutable caching", async () => {
    const upload = await authed("/v1/admin/media", {
      method: "POST",
      body: pngUpload("pixel.png", "TEST serve"),
    });
    const media = await upload.json<{ url: string }>();

    const res = await exports.default.fetch(`${BASE}${media.url}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("etag")).toBeTruthy();
  });

  it("404s an object that does not exist", async () => {
    const res = await exports.default.fetch(`${BASE}/v1/media/2026/01/nope.png`);
    expect(res.status).toBe(404);
  });
});

describe("delete", () => {
  it("removes the row and the object, then 404s on a second delete", async () => {
    const upload = await authed("/v1/admin/media", {
      method: "POST",
      body: pngUpload("pixel.png", "TEST delete"),
    });
    expect(upload.status).toBe(201);

    const media = await upload.json<{ id: string; url: string }>();

    const del = await authed(`/v1/admin/media/${media.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const gone = await exports.default.fetch(`${BASE}${media.url}`);
    expect(gone.status).toBe(404);

    const again = await authed(`/v1/admin/media/${media.id}`, {
      method: "DELETE",
    });
    expect(again.status).toBe(404);
  });

  it("404s a non-uuid id", async () => {
    const res = await authed("/v1/admin/media/not-a-uuid", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
