import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const BASE = "http://example.com"; // host doesn't matter; SELF routes by path

describe("GET /v1/health", () => {
  it("returns ok and service metadata", async () => {
    const res = await SELF.fetch(`${BASE}/v1/health`);
    expect(res.status).toBe(200);

    const body = await res.json<{
      ok: boolean;
      service: string;
      version: string;
    }>();

    expect(body).toEqual({
      ok: true,
      service: "blog-api",
      version: "0.1.0",
    });
  });
});

describe("GET /v1/directory", () => {
  it("returns an array of DirectoryEntry", async () => {
    const res = await SELF.fetch(`${BASE}/v1/directory`);
    expect(res.status).toBe(200);

    const body = await res.json<any[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    for (const entry of body) {
      expect(entry).toMatchObject({
        slug: expect.any(String),
        title: expect.any(String),
        kind: expect.any(String),
        updated_at: expect.any(String),
        reading_minutes: expect.any(Number),
      });
      expect(entry).not.toHaveProperty("body");
      expect(entry).not.toHaveProperty("excerpt");
    }
  });

  it("is alphabetical by title", async () => {
    const res = await SELF.fetch(`${BASE}/v1/directory`);
    const body = await res.json<{ title: string }[]>();
    const titles = body.map((e) => e.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);
  });

  it("excludes drafts", async () => {
    const res = await SELF.fetch(`${BASE}/v1/directory`);
    const body = await res.json<{ slug: string }[]>();
    expect(body.map((e) => e.slug)).not.toContain("wip-draft-ideas");
  });
});

describe("GET /v1/notes/:slug — 404 envelope", () => {
  it("returns the standard error envelope for a missing note", async () => {
    const res = await SELF.fetch(`${BASE}/v1/notes/definitely-not-a-note`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = await res.json<{
      error: { code: string; message: string; requestId: string };
    }>();

    expect(body.error.code).toBe("note_not_found");
    expect(body.error.message).toContain("definitely-not-a-note");
    expect(body.error.requestId).toEqual(expect.any(String));
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });

  it("404s on a draft note (non-discoverability)", async () => {
    const res = await SELF.fetch(`${BASE}/v1/notes/wip-draft-ideas`);
    expect(res.status).toBe(404);

    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("note_not_found");
  });
});

describe("GET /v1/search — short query", () => {
  it("returns 400 with the standard envelope for a 1-char query", async () => {
    const res = await SELF.fetch(`${BASE}/v1/search?q=b`);
    expect(res.status).toBe(400);

    const body = await res.json<{
      error: { code: string; message: string; details: any; requestId: string };
    }>();

    expect(body.error.code).toBe("validation_failed");
    expect(body.error.message).toContain("at least 2 characters");
    expect(body.error.details).toHaveProperty("q");
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it("accepts a 2-char query", async () => {
    const res = await SELF.fetch(`${BASE}/v1/search?q=br`);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});