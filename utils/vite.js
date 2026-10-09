import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANIFEST_PATH = path.join(__dirname, "..", "public/.vite/manifest.json");

let manifest = null;

function loadManifest() {
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch (e) {
    console.warn("Vite manifest not found. Have you run the build?");
  }
  return manifest;
}

export function assetPath(logicalPath, type) {
  if (process.env.NODE_ENV === "development") {
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
