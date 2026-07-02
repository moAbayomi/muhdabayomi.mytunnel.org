const http = require("http");
const express = require("express");
const app = express();
const PORT = 3001;
const cors = require("cors");

app.use(cors());

app.use(express.static("public"));

app.get("/", (req, res) => {
	res.render("index");
});

app.listen(PORT, () => {
	console.log(`server is running at http://localhost:${PORT}`);
});
