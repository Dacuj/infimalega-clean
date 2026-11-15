(() => {
  const aboutTitle = "About · Infimalega";
  const originalTitle = document.title;
  const theme = document.querySelector('meta[name="theme-color"]');
  const originalTheme = theme?.content;
  const standalone = document.querySelector(".about-document .about-page");
  let overlay;
  let returnFocus;

  function play(frame) {
    const video = frame.querySelector("video");
    frame.removeAttribute("data-awaiting-playback");
    frame.removeAttribute("tabindex");
    frame.removeAttribute("role");
    frame.removeAttribute("aria-label");

    video.play().catch((error) => {
      if (error.name !== "NotAllowedError" || !frame.isConnected) return;
      frame.setAttribute("data-awaiting-playback", "");
      frame.setAttribute("tabindex", "0");
      frame.setAttribute("role", "button");
      frame.setAttribute("aria-label", "Avvia il video About con audio");
      if (overlay && document.activeElement === overlay) frame.focus({ preventScroll: true });
    });
  }

  function prepare(frame) {
    for (const name of ["contextmenu", "dragstart"]) {
      frame.addEventListener(name, (event) => event.preventDefault());
    }
    frame.addEventListener("click", () => {
      if (frame.hasAttribute("data-awaiting-playback")) play(frame);
    });
    frame.addEventListener("keydown", (event) => {
      if (!frame.hasAttribute("data-awaiting-playback") || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      play(frame);
    });
    play(frame);
  }

  if (standalone) {
    const frame = standalone.querySelector(".about-frame");
    prepare(frame);
    window.addEventListener("pageshow", (event) => {
      if (event.persisted && !frame.querySelector("video").ended) play(frame);
    });
    return;
  }

  function openAbout() {
    if (overlay) return;
    overlay = document.createElement("main");
    overlay.className = "about-page about-overlay";
    overlay.setAttribute("aria-label", "About");
    overlay.tabIndex = -1;
    overlay.innerHTML = `<a class="site-mark about-mark" href="index.html" aria-label="Infimalega, torna alla home">
      <img draggable="false" src="media/portfolio/croce.png" alt="" width="280" height="279">
    </a>
    <a class="about-nav-link about-collections" href="index.html#collezioni">Collezioni</a>
    <div class="about-frame">
      <video src="media/portfolio/about-infimalega.mp4" poster="media/portfolio/about-infimalega.jpg"
        width="960" height="720" loop playsinline preload="metadata" disablepictureinpicture
        disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback" draggable="false"
        aria-label="Infimalega, video About"></video>
    </div>
    <a class="about-nav-link about-archive" href="shop.html">Archivio</a>`;
    document.body.append(overlay);
    document.documentElement.classList.add("about-open");
    document.title = aboutTitle;
    if (theme) theme.content = "#000000";
    // Keep the play request within the original navigation gesture for Safari.
    prepare(overlay.querySelector(".about-frame"));
    overlay.focus({ preventScroll: true });
  }

  function closeAbout() {
    if (!overlay) return;
    overlay.querySelector("video").pause();
    overlay.remove();
    overlay = undefined;
    document.documentElement.classList.remove("about-open");
    document.title = originalTitle;
    if (theme) theme.content = originalTheme;
    returnFocus?.focus({ preventScroll: true });
  }

  for (const link of document.querySelectorAll("[data-about-link]")) {
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (overlay) return;
      returnFocus = link;
      history.pushState({ infimalegaAbout: true }, "", link.href);
      openAbout();
    });
  }

  window.addEventListener("popstate", (event) => {
    if (event.state?.infimalegaAbout) openAbout();
    else closeAbout();
  });

  window.addEventListener("pagehide", () => overlay?.querySelector("video").pause());
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && overlay && !overlay.querySelector("video").ended) play(overlay.querySelector(".about-frame"));
  });
})();
