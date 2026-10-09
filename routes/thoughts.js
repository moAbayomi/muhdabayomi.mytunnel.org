import express from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import crypto from "crypto";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import r2 from "../middleware/r2.js";
import { slugify } from "../utils/slugify.js";
import { marked } from "marked";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const router = express.Router();

const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

function groupByMonth(entries) {
  const groups = {};
  for (const entry of entries) {
    const key = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "Africa/Lagos",
    }).format(new Date(entry.created_at));

    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return groups;
}

router.get("/", (req, res) => {
  const entries = db
    .prepare(
      "SELECT * FROM entries WHERE deleted_at IS NULL ORDER BY note_modified DESC",
    )
    .all();

  res.render("thoughts/all_thoughts", {
    title: "thoughts",
    grouped: groupByMonth(entries),
  });
});

router.get("/:slug", (req, res) => {
  const entry = db
    .prepare("SELECT * FROM entries WHERE slug = ?")
    .get(req.params.slug);

  if (!entry) return res.status(404).render("404");
  res.render("thoughts/thoughts_entry", { entry });
});

router.post("/", requireAuth, upload.single("photo"), (req, res) => {
  const { title, content, source_note_id, note_modified } = req.body;

  if (!title || !content || !source_note_id || !note_modified) {
    return res.status(400).json({
      error: "title, content, source_note_id, note_modified are required",
    });
  }

  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const slug = slugify(title);
  const htmlContent = marked.parse(content);

  db.prepare(
    `INSERT INTO entries (slug, title, content, source_note_id, note_modified, photo_url) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(source_note_id) DO UPDATE SET
		title = excluded.title,
		content = excluded.content,
		note_modified = excluded.note_modified,
		photo_url = excluded.photo_url,
		created_at = datetime('now')

		`,
  ).run(slug, title, htmlContent, source_note_id, note_modified, photoUrl);

  res.status(201).json({ slug, url: `/thoughts/${slug}` });
});

// DELETE /thoughts/:sourceNoteId — soft-delete, called when a note disappears from Notes
router.delete("/", requireAuth, (req, res) => {
  const noteID = req.query.sourceNoteId;

  if (!noteID) {
    return res.status(400).json({ error: "Missing sourceNoteId parameter" });
  }
  const result = db
    .prepare(
      `UPDATE entries SET deleted_at = datetime('now')
			 WHERE source_note_id = ? AND deleted_at IS NULL`,
    )
    .run(noteID);

  if (result.changes === 0) {
    return res.status(404).json({ error: "not found or already deleted" });
  }

  res.json({ deleted: true });
});

// POST /thoughts/media — uploads one image, returns its hosted URL.
router.post("/media", requireAuth, upload.array("photo"), async (req, res) => {
  if (req.files.length < 1) {
    return res.status(400).json({ error: "no photo provided" });
  }

  const uploadedUrls = [];

  for (let file of req.files) {
    const baseName = file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, "-")
      .replace(/-+/g, "-");

    // Formats to: "2026-07-17, 11-53-00"
    const date_time = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(Date.now())
      .replace(/,\s/g, "-") // Removes the comma and space
      .replace(/:/g, "-"); // Replaces time colons with hyphens

    const uniqueFilename = `${baseName}-${date_time}.webp`;

    try {
      const optimizedBuffer = await sharp(file.buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: `uploads/${uniqueFilename}`,
          Body: optimizedBuffer,
          ContentType: "image/webp",
        }),
      );

      const publicUrl = `${process.env.R2_PUBLIC_URL}/uploads/${uniqueFilename}`;
      console.log(publicUrl);
      uploadedUrls.push(publicUrl);
      //return res.status(201).json({ url: publicUrl });
    } catch (error) {
      console.error("Cloudflare R2 Upload Failure:", error);
      return res.status(500).json({ error: "Failed to upload image" });
    }
  }
  return res.status(201).json(
    uploadedUrls.map((u) => ({
      url: u,
    })),
  );
});

export default router;
