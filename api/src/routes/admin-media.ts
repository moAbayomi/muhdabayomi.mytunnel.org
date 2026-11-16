import { Hono } from "hono";
import { sql } from "../db";
import type { AppEnv } from "../env";
import { AppError } from "../errors";
import { uuidOr404 } from "../lib/ids";

const adminMedia = new Hono<AppEnv>();

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const CACHE_CONTROL = "public, max-age=31536000, immutable";

type Sniffed = { mime: string; ext: string };

/**
 * Identify an image by its leading bytes, not by its filename or the
 * client-supplied Content-Type — both are attacker-controlled.
 *
 *   JPEG  FF D8 FF
 *   PNG   89 50 4E 47 0D 0A 1A 0A
 *   WebP  52 49 46 46 .... 57 45 42 50   ("RIFF" .... "WEBP")
 */
function sniff(bytes: Uint8Array): Sniffed | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  return null;
}

adminMedia.post("/", async (c) => {
  // Cheap rejection before buffering the body. The real check is file.size
  // below, since Content-Length can lie or be absent.
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_BYTES + 64 * 1024) {
    throw new AppError(413, "file_too_large", "Files must be 10 MB or smaller");
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new AppError(400, "invalid_body", "Expected multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new AppError(400, "file_required", 'Expected a "file" field');
  }
  if (file.size === 0) {
    throw new AppError(400, "empty_file", "The uploaded file is empty");
  }
  if (file.size > MAX_BYTES) {
    throw new AppError(413, "file_too_large", "Files must be 10 MB or smaller");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniff(bytes);
  if (!sniffed) {
    throw new AppError(
      415,
      "unsupported_type",
      "Only JPEG, PNG and WebP images are accepted",
    );
  }

  const now = new Date();
  const key = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${crypto.randomUUID()}.${sniffed.ext}`,
  ].join("/");

  await c.env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: {
      contentType: sniffed.mime,
      cacheControl: CACHE_CONTROL,
    },
  });

  // With a public R2 domain configured, hand out that URL. Without one (local
  // dev, tests), fall back to serving through /v1/media/* so the image works.
  const base = (c.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  const url = base ? `${base}/${key}` : `/v1/media/${key}`;

  const altValue = form.get("alt");
  const alt =
    typeof altValue === "string" && altValue.trim() ? altValue.trim() : null;

  const [row] = await sql`
    INSERT INTO media (r2_key, url, mime, bytes, alt)
    VALUES (${key}, ${url}, ${sniffed.mime}, ${file.size}, ${alt})
    RETURNING id, r2_key, url, mime, bytes::int AS bytes,
              width, height, alt, created_at
  `;

  return c.json(row, 201);
});

adminMedia.delete("/:id", async (c) => {
  const id = uuidOr404(c.req.param("id"), "media");

  const rows = (await sql`
    SELECT id, r2_key FROM media WHERE id = ${id}::uuid
  `) as { id: string; r2_key: string }[];

  const row = rows[0];
  if (!row) throw new AppError(404, "media_not_found", "No media with that id");

  // Object first: if the row went first and the delete failed, the object
  // would be orphaned with nothing pointing at it.
  await c.env.MEDIA_BUCKET.delete(row.r2_key);
  await sql`DELETE FROM media WHERE id = ${id}::uuid`;

  return c.body(null, 204);
});

export default adminMedia;
