function slugify(title) {
	return title
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "") // strip punctuation
		.replace(/\s+/g, "-") // spaces to dashes
		.replace(/-+/g, "-"); // collapse repeats
}

module.exports = { slugify };
