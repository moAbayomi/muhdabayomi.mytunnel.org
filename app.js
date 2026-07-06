const express = require("express");
const path = require("path");
const expressLayouts = require("express-ejs-layouts");
require("dotenv").config();
const fs = require("fs");

const { assetPath } = require("./utils/vite");
const pageRoutes = require("./routes/pages");
const thoughtsRoutes = require("./routes/thoughts");

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
