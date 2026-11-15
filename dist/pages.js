"use strict";

const intro = document.getElementById("intro");
const photographs = document.getElementById("photographs");
const filter = document.getElementById("archive-filter");
const rooms = document.querySelectorAll(".room");

if (intro) {
  const legacy = location.hash.slice(1).split("/");
  const oldRoute = {
    serie: "serie.html",
    archivio: "archivio.html",
    contatti: "contatti.html"
  }[legacy[0]];
  if (legacy[0] === "serie" && ["street-study", "amore-tossico", "insecto"].includes(legacy[1])) {
    location.replace(legacy[1] + ".html");
  } else if (legacy[0] === "capo" && /^inf-\d{3}$/.test(legacy[1])) {
    location.replace(legacy[1] + ".html");
  } else if (oldRoute) {
    location.replace(oldRoute);
  }

  const playback = document.getElementById("playback");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  function updatePlayback() {
    playback.textContent = intro.paused ? "Riproduci" : "Pausa";
  }
  function playIntro() {
    intro.muted = true;
    intro.play().catch(updatePlayback);
  }
  intro.addEventListener("play", updatePlayback);
  intro.addEventListener("pause", updatePlayback);
  playback.hidden = false;
  playback.addEventListener("click", () => {
    if (intro.paused) playIntro();
    else intro.pause();
  });
  motion.addEventListener("change", ({ matches }) => {
    if (matches) intro.pause();
  });
  if (!motion.matches) playIntro();
}

if (photographs) {
  const tiles = [...photographs.querySelectorAll("[data-photo]")];
  const fullPhoto = document.getElementById("full-photo");
  const centralImage = fullPhoto.querySelector("img");
  const caption = document.getElementById("caption");
  const hover = matchMedia("(hover: hover)");
  let selected;

  function show(tile) {
    centralImage.src = tile.href;
    centralImage.alt = "Street Study, foto " + tile.dataset.photo;
    fullPhoto.href = tile.href;
    caption.textContent = tile.dataset.caption;
  }

  function select(tile) {
    selected = tile;
    for (const candidate of tiles) {
      if (candidate === selected) candidate.setAttribute("aria-current", "true");
      else candidate.removeAttribute("aria-current");
    }
    show(selected);
  }

  function applyHash() {
    const id = location.hash.match(/^#foto-(\d+)$/)?.[1] || photographs.dataset.initial;
    select(tiles.find((tile) => tile.dataset.photo === id) || tiles[0]);
  }

  for (const tile of tiles) {
    tile.addEventListener("pointerenter", () => {
      if (hover.matches) show(tile);
    });
    tile.addEventListener("pointerleave", () => {
      if (hover.matches) show(selected);
    });
    tile.addEventListener("focus", () => show(tile));
    tile.addEventListener("blur", () => show(selected));
    tile.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      select(tile);
      history.replaceState(null, "", "#foto-" + tile.dataset.photo);
    });
  }

  window.addEventListener("hashchange", applyHash);
  applyHash();
}

if (rooms.length && "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const margin = Math.round(window.innerHeight * 0.4);
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const image = entry.target.querySelector("img");
      document.body.style.setProperty("--room-image", 'url("' + image.getAttribute("src") + '")');
    }
  }, { rootMargin: "-" + margin + "px 0px -" + margin + "px 0px" });
  for (const room of rooms) observer.observe(room);
}

if (filter) {
  const rows = [...document.querySelectorAll("tbody tr")];
  const terms = (text) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  function applyFilter() {
    const query = terms(filter.elements.query.value.trim()).split(/\s+/).filter(Boolean);
    const year = filter.elements.year.value;
    let found = false;
    for (const row of rows) {
      row.hidden = Boolean(year && year !== row.dataset.year) || !query.every((term) => terms(row.dataset.terms).includes(term));
      if (!row.hidden) found = true;
    }
    document.getElementById("empty").hidden = found;
  }
  filter.addEventListener("input", applyFilter);
  filter.addEventListener("submit", (event) => {
    event.preventDefault();
    applyFilter();
  });
  filter.hidden = false;
  applyFilter();
}
