import "./styles/tailwind.css";

document.addEventListener("DOMContentLoaded", () => {
	console.log("Frontend assets linked!");
    console.log(process.env.NODE_ENV)

	function updateTime() {
		const time = new Intl.DateTimeFormat("en-US", {
			timeZone: "Africa/Lagos",
			hour: "numeric",
			minute: "2-digit",
		}).format(new Date());

		document.getElementById("local-time").textContent =
			`${time.replace(/\s?(AM|PM)/i, "")} in Osun, Nigeria`;
	}

	updateTime();
	setInterval(updateTime, 1000 * 30);
});
