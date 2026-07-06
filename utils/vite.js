const fs = require("fs");
const path = require("path");

let MANIFEST_PATH = path.join("__dirname", "..", "public/.vite/manifest.json");

let manifest = null;
function loadManifest() {
	try {
		manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
	} catch (e) {
		console.warn("Vite manifest not found. Have you run the build?");
	}
	return manifest;
}

function assetPath(logicalPath, type) {
	if (process.env.NODE_ENV == "development") {
		return logicalPath;
	}
	const currentManifest = manifest || loadManifest();
	if (!currentManifest) return logicalPath;
	const entry = currentManifest[logicalPath];
	if (!entry) return logicalPath;

	if (type === "css" && entry.css?.length > 0) {
		return "/" + entry.css[0];
	}
	return "/" + entry.file;
}

module.exports = { assetPath };
