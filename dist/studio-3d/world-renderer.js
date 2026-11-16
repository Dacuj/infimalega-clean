import * as THREE from "three";
import { SparkRenderer, SplatMesh, dyno } from "./vendor/spark.module.js";

function makeAperture(item) {
  if (!item.aperture) return undefined;
  const { x, y, radius, startDepth, endDepth, cameraStart = -.08, cameraEnd = .60 } = item.aperture;
  const openness = dyno.dynoFloat(0);
  const modifier = new dyno.Dyno({
    inTypes: { gsplat: dyno.Gsplat, scale: "float", center: "vec2", radius: "float", depthRamp: "vec2", openness: "float" },
    outTypes: { gsplat: dyno.Gsplat },
    inputs: {
      scale: dyno.dynoConst("float", 1 / item.centerDepth),
      center: dyno.dynoConst("vec2", new THREE.Vector2(x, y)),
      radius: dyno.dynoConst("float", radius),
      depthRamp: dyno.dynoConst("vec2", new THREE.Vector2(startDepth, endDepth)),
      openness,
    },
    statements: ({ inputs: p, outputs: o }) => dyno.unindentLines(`
      ${o.gsplat} = ${p.gsplat};
      if (${p.openness} > 0.0) {
        vec3 local = ${p.gsplat}.center * ${p.scale};
        float depth = -local.z - 1.0;
        vec2 ramp = ${p.depthRamp};
        float layer = smoothstep(ramp.x, ramp.y, depth);
        if (layer > 0.0) {
          vec2 offset = (local.xy - ${p.center}) / ${p.radius};
          float breakup = sin(dot(offset, vec2(25.0, 17.0))) * 0.052;
          breakup += cos(dot(offset, vec2(11.0, -32.0))) * 0.029;
          float rim = 0.916 + breakup;
          float opening = 1.0 - smoothstep(rim - 0.28, rim, length(offset));
          ${o.gsplat}.rgba.a *= 1.0 - ${p.openness} * layer * opening;
        }
      }
    `),
  });
  return { openness, modifier, cameraStart, cameraEnd };
}

export function createWorldRenderer(items, onDirty) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  const canvas = renderer.domElement;
  canvas.dataset.walkRender = "";
  canvas.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080609);
  const entries = new Map(items.map((item) => [item.id, { item }]));
  const cameraWorld = new THREE.Vector3();
  let active = [];
  let loading;
  let size;
  let presented = false;
  let contextLost = false;
  let spark = attachSpark();

  function attachSpark() {
    const view = new SparkRenderer({
      renderer,
      enableLod: false,
      sortRadial: false,
      minSortIntervalMs: 34,
      onDirty,
    });
    scene.add(view);
    return view;
  }

  function resize(width, height) {
    if (width < 1 || height < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2_000_000 / (width * height)));
    if (size?.width === width && size.height === height && size.ratio === ratio) return;
    size = { width, height, ratio };
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
  }

  function startNextLoad() {
    if (loading || contextLost || !active.length) return;
    const next = presented
      ? [...active, ...entries.values()].find((entry) => !entry.mesh && !entry.failed)
      : active.find((entry) => !entry.failed);
    if (next && !next.mesh) void load(next);
  }

  async function load(entry) {
    loading = entry;
    const { item } = entry;
    let mesh;
    try {
      entry.aperture = makeAperture(item);
      mesh = new SplatMesh({
        url: new URL(item.src, import.meta.url).href,
        editable: false,
        raycastable: false,
        objectModifier: entry.aperture?.modifier,
      });
      await mesh.initialized;

      // The exported coordinates already face -Z. Place the point at the
      // source camera's median depth at the requested world center.
      mesh.scale.setScalar(1 / item.centerDepth);
      mesh.position.copy(item.center);
      mesh.position.z += 1;
      mesh.visible = false;
      scene.add(mesh);
      entry.mesh = mesh;
    } catch (error) {
      mesh?.dispose();
      entry.failed = true;
      console.warn("Infimalega 3D scene:", item.id, error);
    } finally {
      loading = undefined;
      onDirty();
      if (presented) startNextLoad();
    }
  }

  function hasLoaded(item) {
    return Boolean(entries.get(item?.id)?.mesh);
  }

  function hasFailed(item) {
    return Boolean(entries.get(item?.id)?.failed);
  }

  function render(camera, activeItems) {
    if (!size || contextLost) return false;

    active = [...new Set(activeItems.map(({ id }) => entries.get(id)).filter(Boolean))].slice(0, 3);
    startNextLoad();

    const visible = active.filter((entry) => entry.mesh);
    if (!visible.length) return false;
    camera.getWorldPosition(cameraWorld);
    for (const entry of entries.values()) {
      if (entry.mesh) entry.mesh.visible = visible.includes(entry);
    }
    for (const entry of visible) {
      if (!entry.aperture) continue;
      const { openness, cameraStart, cameraEnd } = entry.aperture;
      const depth = entry.item.center.z - cameraWorld.z;
      const amount = Math.round(128 * THREE.MathUtils.smoothstep(depth, cameraStart, cameraEnd)) / 128;
      if (amount !== openness.value) {
        openness.value = amount;
        entry.mesh.updateVersion();
      }
    }

    renderer.render(scene, camera);
    presented ||= spark.activeSplats > 0;
    if (presented) startNextLoad();
    return presented;
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    scene.remove(spark);
    spark.dispose();
    spark = attachSpark();
    presented = false;
    contextLost = false;
    onDirty();
  });

  return { canvas, resize, render, hasFailed, hasLoaded };
}
