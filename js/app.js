(() => {
  // ---------------------------
  // Countries data
  // ---------------------------
  const unavailable = ["Russia", "Belarus", "Syria", "Iran", "Iraq", "Venesualla"];

  // Europe list (incl. microstates & Kosovo). Russia/Belarus intentionally excluded.
  // (Also excludes anything in `unavailable` even if it "could be Europe" in some lists.)
  const europeAll = [
    "Albania",
    "Andorra",
    "Armenia",
    "Austria",
    "Azerbaijan",
    "Belgium",
    "Bosnia and Herzegovina",
    "Bulgaria",
    "Croatia",
    "Cyprus",
    "Czechia",
    "Denmark",
    "Estonia",
    "Finland",
    "France",
    "Georgia",
    "Germany",
    "Greece",
    "Hungary",
    "Iceland",
    "Ireland",
    "Italy",
    "Kosovo",
    "Latvia",
    "Liechtenstein",
    "Lithuania",
    "Luxembourg",
    "Malta",
    "Moldova",
    "Monaco",
    "Montenegro",
    "Netherlands",
    "North Macedonia",
    "Norway",
    "Poland",
    "Portugal",
    "Romania",
    "San Marino",
    "Serbia",
    "Slovakia",
    "Slovenia",
    "Spain",
    "Sweden",
    "Switzerland",
    "Turkey",
    "Ukraine",
    "United Kingdom",
    "Vatican City"
  ];

  const alsoAvailable = ["USA", "Canada", "Ethiopia"];
  const europeFiltered = europeAll.filter(c => !unavailable.includes(c));

  // ---------------------------
  // Modal logic
  // ---------------------------
  const modal = document.getElementById("modal");
  const openBtn = document.getElementById("openModalBtn");
  const closeBtn = document.getElementById("closeModalBtn");

  const europeListEl = document.getElementById("europeList");
  const otherListEl = document.getElementById("otherList");
  const unavailableTextEl = document.getElementById("unavailableText");

  function fillLists() {
    // Europe grid
    europeListEl.innerHTML = europeFiltered
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map(c => `<div class="countryItem">${escapeHtml(c)}</div>`)
      .join("");

    // Other chips
    otherListEl.innerHTML = alsoAvailable
      .map(c => `<div class="countryChip">${escapeHtml(c)}</div>`)
      .join("");

    // Unavailable text
    unavailableTextEl.textContent = unavailable.join(", ");
  }

  function openModal() {
    fillLists();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-close") === "true") {
      closeModal();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
  });

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------------------------
  // Background "ban trail" FX
  // ---------------------------
  const trailLayer = document.getElementById("trail-layer");

  const MAX_MARKS = 42;        // hard cap
  const SPAWN_EVERY_MS = 28;   // throttle
  let lastSpawn = 0;

  const liveNodes = [];

  function spawnBan(x, y) {
    // If too many nodes, remove the oldest
    while (liveNodes.length >= MAX_MARKS) {
      const old = liveNodes.shift();
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    const el = document.createElement("div");
    el.className = "trailBan";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    // Slight randomness (size/rotation/opacity)
    const scale = 0.75 + Math.random() * 0.65;
    const rot = (Math.random() * 50) - 25; // -25..+25
    el.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${rot}deg)`;

    // Build inner parts
    const ring = document.createElement("div");
    ring.className = "trailBan__ring";
    const slash = document.createElement("div");
    slash.className = "trailBan__slash";

    el.appendChild(ring);
    el.appendChild(slash);

    trailLayer.appendChild(el);
    liveNodes.push(el);

    // Cleanup after animation
    const ttl = 1300; // keep in sync with CSS animation duration
    window.setTimeout(() => {
      const idx = liveNodes.indexOf(el);
      if (idx !== -1) liveNodes.splice(idx, 1);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, ttl);
  }

  window.addEventListener("pointermove", (e) => {
    const now = performance.now();
    if (now - lastSpawn < SPAWN_EVERY_MS) return;
    lastSpawn = now;

    // optional: don't spawn trail while modal open
    if (modal.classList.contains("is-open")) return;

    spawnBan(e.clientX, e.clientY);
  }, { passive: true });

  // ---------------------------
  // NEW: Red fading spots background
  // ---------------------------
  const spotLayer = document.getElementById("spot-layer");
  const MAX_SPOTS = 7; // cap to avoid lag

  function spawnSpot() {
    if (!spotLayer) return;
    if (spotLayer.childElementCount >= MAX_SPOTS) return;

    const spot = document.createElement("div");
    spot.className = "redSpot";

    // random position
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    spot.style.left = `${x}%`;
    spot.style.top = `${y}%`;

    // random size a bit
    const size = 240 + Math.floor(Math.random() * 260); // 240..500
    spot.style.width = `${size}px`;
    spot.style.height = `${size}px`;

    spotLayer.appendChild(spot);

    // remove after animation
    window.setTimeout(() => {
      if (spot && spot.parentNode) spot.parentNode.removeChild(spot);
    }, 6400);
  }

  // spawn periodically
  window.setInterval(spawnSpot, 1100);

})();
