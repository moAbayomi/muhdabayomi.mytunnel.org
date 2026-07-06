const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { slugify } = require("../utils/slugify");

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
		.prepare("SELECT * FROM entries ORDER BY created_at DESC")
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
	const { title, content } = req.body;

	if (!title || !content) {
		return res.status(400).json({ error: "title and content are required" });
	}

	const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
	const slug = slugify(title);

	db.prepare(
		`INSERT INTO entries (slug, title, content, photo_url) VALUES (?, ?, ?, ?)`,
	).run(slug, title, content, photoUrl);

	res.status(201).json({ slug, url: `/thoughts/${slug}` });
});

module.exports = router;
