const preference = matchMedia("(prefers-reduced-motion: reduce)");
const inserts = [...document.querySelectorAll("[data-walk-film]")].map((figure) => ({
  video: figure.querySelector("video"),
  button: figure.querySelector("[data-walk-play]"),
  visible: !("IntersectionObserver" in window),
  playRequested: null,
}));

function syncPlayback({ video, visible, playRequested }) {
  if (visible && !document.hidden && (playRequested ?? !preference.matches)) {
    if (video.paused) video.play().catch(() => {});
  } else {
    video.pause();
  }
}

const observer = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const insert = inserts.find(({ video }) => video === entry.target);
      insert.visible = entry.intersectionRatio >= .16;
      syncPlayback(insert);
    }
  }, { threshold: .16 })
  : null;

for (const insert of inserts) {
  const { video, button } = insert;
  const label = video.getAttribute("aria-label");
  const updateButton = () => {
    button.textContent = video.paused ? "Riproduci" : "Pausa";
    button.setAttribute("aria-label", button.textContent + " " + label.toLowerCase());
  };
  video.addEventListener("play", updateButton);
  video.addEventListener("pause", updateButton);
  button.addEventListener("click", () => {
    insert.playRequested = video.paused;
    syncPlayback(insert);
  });
  updateButton();
  button.hidden = false;
  observer?.observe(video);
}

function refreshPlayback() {
  inserts.forEach(syncPlayback);
}
document.addEventListener("visibilitychange", refreshPlayback);
preference.addEventListener("change", refreshPlayback);
