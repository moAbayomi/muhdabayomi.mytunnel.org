import { exports } from "cloudflare:workers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "../src/db";

const BASE = "http://example.com";
const TEST_PASSWORD = ["test", "only"].join("-");

let token = "";

async function authed(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  return exports.default.fetch(`${BASE}${path}`, { ...init, headers });
}

type Note = {
  id: string;
  slug: string;
  title: string;
  body: string;
  status: string;
  updated_at: string;
  reading_minutes: number;
  parent_id: string | null;
};

async function createNote(title: string, body = ""): Promise<Note> {
  const res = await authed("/v1/admin/notes", {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  expect(res.status).toBe(201);
  return (await res.json<Note>()) as Note;
}

beforeAll(async () => {
  // Idempotent: a failed previous run must not collide on slugs.
  await sql`DELETE FROM notes WHERE title LIKE 'TEST %'`;

  const res = await exports.default.fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  });
  token = (await res.json<{ token: string }>()).token;
});

afterAll(async () => {
  await sql`DELETE FROM notes WHERE title LIKE 'TEST %'`;
  await sql`DELETE FROM login_attempts WHERE ip = '127.0.0.1'`;
});

describe("admin access control", () => {
  it("rejects a request with no token", async () => {
    const res = await exports.default.fetch(`${BASE}/v1/admin/notes`);
    expect(res.status).toBe(401);

    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("unauthorized");
  });
});

describe("create and update", () => {
  it("creates a note and derives its slug", async () => {
    const note = await createNote("TEST admin flow", "hello");
    expect(note.slug).toBe("test-admin-flow");
    expect(note.status).toBe("draft");
    expect(note.reading_minutes).toBe(1);
  });

  it("patches the body and recomputes reading time", async () => {
    const note = await createNote("TEST reading", "hi");
    const longBody = Array.from({ length: 800 }, (_, i) => `word${i}`).join(" ");

    const res = await authed(`/v1/admin/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: longBody, updatedAt: note.updated_at }),
    });

    expect(res.status).toBe(200);
    const updated = await res.json<Note>();
    expect(updated.reading_minutes).toBe(4); // 800 words / 200
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(note.updated_at).getTime(),
    );
  });

  it("returns 409 with the current note when updatedAt is stale", async () => {
    const note = await createNote("TEST conflict", "one");

    const first = await authed(`/v1/admin/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: "two", updatedAt: note.updated_at }),
    });
    expect(first.status).toBe(200);

    const second = await authed(`/v1/admin/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: "three", updatedAt: note.updated_at }),
    });
    expect(second.status).toBe(409);

    const body = await second.json<{
      error: { code: string; details: { current: Note } };
    }>();
    expect(body.error.code).toBe("stale_note");
    expect(body.error.details.current.id).toBe(note.id);
    expect(body.error.details.current.body).toBe("two");
  });

  it("sets and clears a parent by slug, and rejects an unknown parent", async () => {
    const parent = await createNote("TEST parent", "p");
    const child = await createNote("TEST child", "c");

    const setRes = await authed(`/v1/admin/notes/${child.id}`, {
      method: "PATCH",
      body: JSON.stringify({ parentSlug: parent.slug, updatedAt: child.updated_at }),
    });
    expect(setRes.status).toBe(200);
    const set = await setRes.json<Note>();
    expect(set.parent_id).toBe(parent.id);

    const clearRes = await authed(`/v1/admin/notes/${child.id}`, {
      method: "PATCH",
      body: JSON.stringify({ parentSlug: null, updatedAt: set.updated_at }),
    });
    expect(clearRes.status).toBe(200);
    const cleared = await clearRes.json<Note>();
    expect(cleared.parent_id).toBeNull();

    const badRes = await authed(`/v1/admin/notes/${child.id}`, {
      method: "PATCH",
      body: JSON.stringify({ parentSlug: "no-such-note", updatedAt: cleared.updated_at }),
    });
    expect(badRes.status).toBe(422);
  });

  it("404s a non-uuid id", async () => {
    const res = await authed("/v1/admin/notes/not-a-uuid");
    expect(res.status).toBe(404);
  });
});

describe("publish lifecycle", () => {
  it("refuses to publish an empty body with 422", async () => {
    const note = await createNote("TEST empty", "   ");

    const res = await authed(`/v1/admin/notes/${note.id}/publish`, { method: "POST" });
    expect(res.status).toBe(422);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("invalid_note");
  });

  it("publishes and unpublishes", async () => {
    const note = await createNote("TEST publishable", "some body");

    const pub = await authed(`/v1/admin/notes/${note.id}/publish`, { method: "POST" });
    expect(pub.status).toBe(200);
    expect((await pub.json<Note>()).status).toBe("published");

    const unpub = await authed(`/v1/admin/notes/${note.id}/unpublish`, {
      method: "POST",
    });
    expect(unpub.status).toBe(200);
    expect((await unpub.json<Note>()).status).toBe("draft");
  });
});

describe("links", () => {
  it("reports outgoing links and unresolved targets", async () => {
    const note = await createNote(
      "TEST links",
      "See [[about]] and [[typo-does-not-exist]].",
    );

    const res = await authed(`/v1/admin/notes/${note.id}/links`);
    expect(res.status).toBe(200);

    const report = await res.json<{
      outgoing: { slug: string }[];
      unresolved: { slug: string }[];
    }>();

    expect(report.outgoing.map((o) => o.slug)).toContain("about");
    expect(report.outgoing.map((o) => o.slug)).not.toContain("typo-does-not-exist");
    expect(report.unresolved.map((u) => u.slug)).toContain("typo-does-not-exist");
  });
});

describe("revisions", () => {
  it("records a revision on edit and restores it", async () => {
    const note = await createNote("TEST revisions", "original body");

    const edit = await authed(`/v1/admin/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: "edited body", updatedAt: note.updated_at }),
    });
    expect(edit.status).toBe(200);

    const listRes = await authed(`/v1/admin/notes/${note.id}/revisions`);
    expect(listRes.status).toBe(200);

    const revisions = await listRes.json<
      { id: string; body_preview: string }[]
    >();
    expect(revisions.length).toBeGreaterThan(0);
    expect(revisions[0]!.body_preview).toContain("original body");

    const restore = await authed(
      `/v1/admin/notes/${note.id}/revisions/${revisions[0]!.id}/restore`,
      { method: "POST" },
    );
    expect(restore.status).toBe(200);
    expect((await restore.json<Note>()).body).toBe("original body");
  });

  it("404s a revision that belongs to another note", async () => {
    const a = await createNote("TEST rev a", "a");
    const b = await createNote("TEST rev b", "b");

    await authed(`/v1/admin/notes/${a.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: "a2", updatedAt: a.updated_at }),
    });

    const list = await authed(`/v1/admin/notes/${a.id}/revisions`);
    const revisions = await list.json<{ id: string }[]>();

    const res = await authed(
      `/v1/admin/notes/${b.id}/revisions/${revisions[0]!.id}/restore`,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });
});

describe("delete and restore", () => {
  it("soft-deletes, hides from the default list, and restores", async () => {
    const note = await createNote("TEST deletable", "bye");

    const del = await authed(`/v1/admin/notes/${note.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const gone = await authed(`/v1/admin/notes/${note.id}`);
    expect(gone.status).toBe(404);

    const list = await authed("/v1/admin/notes?deleted=true&status=all");
    const rows = await list.json<{ id: string }[]>();
    expect(rows.some((r) => r.id === note.id)).toBe(true);

    const restored = await authed(`/v1/admin/notes/${note.id}/restore`, {
      method: "POST",
    });
    expect(restored.status).toBe(200);
    expect((await restored.json<Note>()).body).toBe("bye");
  });
});

describe("rebuild hook", () => {
  it("returns 503 when DEPLOY_HOOK_URL is not configured", async () => {
    const res = await authed("/v1/admin/rebuild", { method: "POST" });
    expect(res.status).toBe(503);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe(
      "rebuild_not_configured",
    );
  });
});
