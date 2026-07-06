const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
	res.render("index", { title: "muhammads websiteee" });
});

module.exports = router;
