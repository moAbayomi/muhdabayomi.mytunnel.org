import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import expressLayouts from "express-ejs-layouts";
import dotenv from "dotenv";
import fs from "fs";

import { assetPath } from "./utils/vite.js";
import pageRoutes from "./routes/pages.js";
import thoughtsRoutes from "./routes/thoughts.js";

// Recreate __dirname (not available in ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.set("view engine", "ejs");

app.set("views", path.join(__dirname, "views"));

// serve static files from public (nginx can also serve directly)
app.use(expressLayouts);
app.use(express.static(path.join(__dirname, "public")));

app.locals.assetPath = assetPath;

// routes
app.use("/", pageRoutes);
app.use("/thoughts", thoughtsRoutes);

// start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on ${port}`);
});
