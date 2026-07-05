const express = require("express");
const path = require("path");
const expressLayouts = require("express-ejs-layouts");
require("dotenv").config();
const fs = require("fs");

const app = express();
app.set("view engine", "ejs");

app.set("views", path.join(__dirname, "views"));

// serve static files from public (nginx can also serve directly)
app.use(expressLayouts);
app.use(express.static(path.join(__dirname, "public")));

// helper to map logical asset paths to built manifest entries (production)
let manifest = null;
if (process.env.NODE_ENV === "production") {
	try {
		manifest = JSON.parse(
			fs.readFileSync(
				path.join(__dirname, "public/.vite/manifest.json"),
				"utf8",
			),
		);
	} catch (e) {
		console.warn("Vite manifest not found. Have you run the build?");
	}
}

app.locals.assetPath = function (logicalPath, type) {
	// logicalPath example: 'src/main.js' or 'src/styles/tailwind.css'
	if (process.env.NODE_ENV === "development") {
		// dev handled in template via Vite URL
		return logicalPath;
	}
	if (!manifest) {
		try {
		manifest = JSON.parse(
			fs.readFileSync(
				path.join(__dirname, "public/.vite/manifest.json"),
				"utf8",
			),
		);
	} catch (e) {
		console.warn("Vite manifest still building");
		return logicalPath
	}
	}
	const entry = manifest[logicalPath];
	if (!entry) return logicalPath;
	if (type === "css" && entry.css && entry.css.length > 0) {
		return "/" + entry.css[0];
	}

	return "/" + entry.file; // entry.file is e.g. assets/main.abc123.js
};

// Example routes
app.get("/", (req, res) => {
	res.render("index", { title: "Home" });
});

// start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
	console.log(`Server listening on ${port}`);
});
