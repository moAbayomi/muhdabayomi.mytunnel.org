const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { slugify } = require("../utils/slugify");
const { marked } = require("marked");

const router = express.Router();

const storage = multer.diskStorage({
	destination: path.join(__dirname, "..", "public", "uploads"),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname);
		cb(null, `${crypto.randomUUID()}${ext}`);
	},
});

const upload = multer({ storage });

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
		.prepare("SELECT * FROM entries ORDER BY note_modified DESC")
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
router.post("/media", requireAuth, upload.single("photo"), (req, res) => {
	if (!req.file) {
		return res.status(400).json({ error: "no photo provided" });
	}
	res.status(201).json({ url: `/uploads/${req.file.filename}` });
});
module.exports = router;
