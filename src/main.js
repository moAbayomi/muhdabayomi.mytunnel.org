import "./styles/tailwind.css";

document.addEventListener("DOMContentLoaded", () => {
	function applyTheme() {
		document.documentElement.classList.toggle(
			"dark",
			localStorage.theme === "dark" ||
				(!("theme" in localStorage) &&
					window.matchMedia("(prefers-color-scheme: dark)").matches),
		);
	}

	applyTheme()

	// theme
	const day_btn = document.getElementById("day");
	const night_btn = document.getElementById("night");

	day_btn.onclick = function () {
		console.log("hah its a good day");
		localStorage.theme = "light";
		applyTheme()
	};

	night_btn.onclick = function () {
		console.log("its a very good night");
		localStorage.theme = "dark";
		applyTheme()
	};

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
