import { CatmullRomCurve3, PerspectiveCamera, Vector3, MathUtils } from "three";

const root = document.documentElement;
const loadProgress = document.querySelector("#studio-load-progress");
const pageContents = document.querySelectorAll("body > header, body > main, body > footer");
const route = document.querySelector(".walk-route");
const screen = route.querySelector(".walk-screen");
const chapters = [...route.querySelectorAll(".walk-chapter")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const { clamp, lerp } = MathUtils;

// Each pair places the camera and its gaze in the reconstruction's local space.
// The last coordinate is distance along the flight into the scene.
const scenes = {
  amore: {
    center: [-.11, .02, 0],
    captionExit: .40,
    aperture: { x: .22, y: .26, startDepth: .22, endDepth: .49, radius: .56, cameraStart: -.12, cameraEnd: .41 },
    flight: [
      [[-.30, -.06, -2.80], [.02, .05, .05]],
      [[-.14, -.06, -1.30], [.025, .135, .23]],
      [[-.035, .045, -.67], [.10, .195, .32]],
      [[.085, .135, -.38], [.165, .27, .45]],
      [[.125, .187, -.12], [.19, .31, .69]],
      [[.17, .225, .20], [.20, .29, 1.29]],
      [[.20, .18, .53], [.27, .155, 1.54]],
    ],
  },
  cuvee: {
    center: [.15, .03, 1.62],
    captionExit: .22,
    aperture: { x: -.12, y: .23, startDepth: -.015, endDepth: .19, radius: .48, cameraStart: -.09, cameraEnd: .36 },
    flight: [
      [[.025, .11, -.88], [-.02, .17, .20]],
      [[.075, .013, -.52], [-.015, .21, .15]],
      [[.095, .035, -.28], [-.04, .232, .22]],
      [[.10, .107, -.065], [-.134, .265, .36]],
      [[.027, .17, .145], [-.16, .255, .78]],
      [[-.13, .165, .40], [-.27, .13, 1.60]],
    ],
  },
  street: {
    center: [-.12, .02, 3.12],
    captionExit: .30,
    aperture: { x: .14, y: .14, startDepth: .11, endDepth: .42, radius: .64, cameraStart: -.09, cameraEnd: .51 },
    flight: [
      [[.035, -.035, -.85], [.00, -.07, .12]],
      [[-.065, -.15, -.55], [.005, -.025, .27]],
      [[-.045, -.13, -.31], [.045, .09, .34]],
      [[.012, -.025, -.09], [.09, .19, .52]],
      [[.075, .12, .12], [.10, .19, 1.04]],
      [[.18, .155, .43], [.30, .11, 1.54]],
    ],
  },
  insecto: {
    center: [.15, -.03, 4.83],
    flight: [
      [[.14, .035, -1.00], [.01, .015, .26]],
      [[.12, -.10, -.79], [.00, .015, 1.00]],
      [[-.20, -.055, -.49], [-.28, .0, 1.45]],
      [[-.51, .06, -.14], [-.48, .02, 2.20]],
      [[-.68, .045, .90], [-.60, .0, 3.20]],
    ],
  },
};

function makeFlight(items) {
  const positions = [];
  const targets = [];
  for (const { id, center } of items) {
    for (const [position, gaze] of scenes[id].flight) {
      const [x, y, depth] = position;
      const [lookX, lookY, lookDepth] = gaze;
      positions.push(new Vector3(center.x + x, center.y + y, center.z - depth));
      targets.push(new Vector3(center.x + lookX, center.y + lookY, center.z - lookDepth));
    }
  }
  const path = new CatmullRomCurve3(positions);
  path.arcLengthDivisions = 720;
  return { path, gaze: new CatmullRomCurve3(targets) };
}

for (const chapter of chapters) {
  chapter.style.setProperty("--focus-x", Number(chapter.dataset.focusX) * 100 + "%");
  chapter.style.setProperty("--focus-y", Number(chapter.dataset.focusY) * 100 + "%");
}

if (root.classList.contains("walk-booting")) {
  for (const element of pageContents) element.inert = true;
}

function finishLoading() {
  root.classList.remove("walk-booting");
  for (const element of pageContents) element.inert = false;
}

function showPhotographs() {
  finishLoading();
  root.classList.remove("walk-loading");
  route.classList.remove("has-depth", "is-active");
  screen.hidden = true;
}

window.addEventListener("studio-load-timeout", () => {
  if (screen.hasAttribute("data-ready")) finishLoading();
  else showPhotographs();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) finishLoading();
});

function start() {
  run().catch((error) => {
    console.warn("Infimalega Apple SHARP:", error);
    showPhotographs();
  });
}

if (!reducedMotion.matches) start();
reducedMotion.addEventListener("change", (event) => {
  if (event.matches) showPhotographs();
  else if (!screen.firstElementChild) start();
});

async function run() {
  const [{ createWorldRenderer }, metadata] = await Promise.all([
    import("./world-renderer.js?v=studio-loading"),
    fetch("./sharp-scenes/index.json?v=studio-loading").then((response) => {
      if (!response.ok) throw new Error("Apple SHARP scene manifest is unavailable");
      return response.json();
    }),
  ]);
  if (reducedMotion.matches || root.classList.contains("walk-load-timeout")) return;

  const items = chapters.map((chapter) => {
    const item = metadata.find(({ id }) => id === chapter.dataset.scene);
    if (!item) throw new Error("Missing scene: " + chapter.dataset.scene);
    const { center: [x, y, depth], aperture } = scenes[item.id];
    return { ...item, center: new Vector3(x, y, -depth), aperture };
  });
  const introScenes = items.slice(0, 3);
  const { path, gaze } = makeFlight(items);
  const camera = new PerspectiveCamera(44, 1, .025, 125);
  const target = new Vector3();
  let width = 0;
  let height = 0;
  let framePending = false;
  let contextLost = false;
  let visibleScroll;
  let drawnAt;
  const renderer = createWorldRenderer(items, requestFrame);

  screen.append(renderer.canvas);
  showScreen();
  if (location.hash === "#archive" || location.hash === "#contatti") {
    // The 3D layout extends the last chapter after the browser resolves the anchor.
    document.getElementById(location.hash.slice(1)).scrollIntoView({ behavior: "instant" });
  }

  function showScreen() {
    screen.hidden = false;
    route.classList.add("has-depth");
    requestFrame();
  }

  function requestFrame() {
    if (framePending || contextLost || screen.hidden || reducedMotion.matches || document.hidden) return;
    framePending = true;
    requestAnimationFrame(draw);
  }

  function draw(now) {
    framePending = false;
    if (contextLost || reducedMotion.matches) return;
    const rect = route.getBoundingClientRect();
    const screenHeight = screen.clientHeight;
    const visible = rect.top < screenHeight * .55 && rect.bottom > screenHeight * .60;
    route.classList.toggle("is-active", visible);
    if (!visible || !screenHeight) {
      if (!visible && screenHeight && root.classList.contains("walk-booting")) finishLoading();
      visibleScroll = undefined;
      drawnAt = undefined;
      return;
    }

    if (width !== screen.clientWidth || height !== screenHeight) {
      width = screen.clientWidth;
      height = screenHeight;
      camera.aspect = width / height;
      camera.fov = lerp(61, 41, MathUtils.smoothstep(camera.aspect, .43, 1.22));
      camera.updateProjectionMatrix();
      renderer.resize(width, height);
    }

    const destination = clamp(-rect.top, 0, rect.height - height);
    const elapsed = drawnAt === undefined ? 0 : now - drawnAt;
    drawnAt = now;
    visibleScroll ??= destination;
    // Keep coarse scroll-wheel steps from becoming sudden camera jumps.
    if (Math.abs(visibleScroll - destination) <= .5) {
      visibleScroll = destination;
    } else {
      visibleScroll = lerp(visibleScroll, destination, 1 - Math.exp(-Math.min(elapsed, 42) / 68));
      requestFrame();
    }
    const scroll = clamp(visibleScroll, 0, rect.height - height);
    const pageProgress = scroll / (rect.height - height);
    // Start at the framed portrait and rejoin the existing track on approach.
    const progress = pageProgress + .078 * (1 - MathUtils.smoothstep(pageProgress, 0, .22));
    // Give the close landmarks more time than the empty stretches between them.
    const t = lerp(path.getUtoTmapping(progress), progress, .58);
    path.getPoint(t, camera.position);
    gaze.getPoint(t, target);
    camera.lookAt(target);
    camera.updateMatrixWorld();

    const caption = items.findLastIndex((_, position) => {
      const previous = items[position - 1];
      return !previous || camera.position.z < previous.center.z - scenes[previous.id].captionExit;
    });
    const current = items[caption];
    const booting = root.classList.contains("walk-booting");
    if (renderer.hasFailed(current)) {
      showPhotographs();
      return;
    }
    const adjacent = items.filter((item) => {
      const ahead = camera.position.z - item.center.z;
      return item !== current && ahead > -1.05 && ahead < 2.85;
    });
    const active = [current, ...adjacent];
    const hasFrame = renderer.render(camera, active);
    if (hasFrame) {
      root.classList.remove("walk-loading");
      screen.dataset.ready = "";
    }
    if (booting) {
      const progress = introScenes.reduce((sum, scene) => sum + renderer.getLoadProgress(scene), 0);
      loadProgress.value = Math.floor(97 * progress / introScenes.length + (hasFrame ? 3 : 0));
      const openingSettled = introScenes.every((scene) => renderer.hasLoaded(scene) || renderer.hasFailed(scene));
      if (hasFrame && openingSettled) finishLoading();
    }

    for (const [position, chapter] of chapters.entries()) {
      chapter.classList.toggle("is-caption", position === caption);
    }
    route.classList.toggle("has-start-cue", scroll < height * .48);
    screen.dataset.scene = current.id;
    screen.dataset.distance = (-camera.position.z).toFixed(2);
    screen.dataset.visibleScenes = active.filter((item) => renderer.hasLoaded(item)).map(({ id }) => id).join(" ");
  }

  renderer.canvas.addEventListener("webglcontextlost", () => {
    contextLost = true;
    showPhotographs();
  });
  renderer.canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    if (!reducedMotion.matches) showScreen();
  });
  window.addEventListener("scroll", requestFrame, { passive: true });
  window.addEventListener("resize", requestFrame);
  window.addEventListener("pageshow", requestFrame);
  document.addEventListener("visibilitychange", requestFrame);
  reducedMotion.addEventListener("change", (event) => {
    if (!event.matches && !contextLost) showScreen();
  });
}
