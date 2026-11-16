import { Hono } from "hono";
import type { AppEnv } from "../env";
import { AppError } from "../errors";

const media = new Hono<AppEnv>();

const CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Public read-through to R2. Production can serve straight from an R2 custom
 * domain (R2_PUBLIC_URL), but local `wrangler dev` and the test runtime have no
 * public URL — this keeps uploaded images viewable without one.
 *
 * Keys are content-addressable-ish (uuid per upload) and never rewritten, so
 * immutable caching is safe.
 */
media.get("/*", async (c) => {
  const key = c.req.path.replace(/^\/v1\/media\//, "");

  if (!key) throw new AppError(404, "media_not_found", "No media key given");

  const object = await c.env.MEDIA_BUCKET.get(key);
  if (!object) throw new AppError(404, "media_not_found", "No such object");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", CACHE_CONTROL);

  return new Response(object.body, { headers });
});

export default media;
