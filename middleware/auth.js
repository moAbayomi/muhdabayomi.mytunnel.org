function requireAuth(req, res, next) {
	const authHeader = req.headers.authorization || "";
	const token = authHeader.replace("Bearer ", "");

	if (!token || token !== process.env.API_TOKEN) {
		return res.status(401).json({ error: "unauthorized" });
	}

	next();
}

module.exports = { requireAuth };