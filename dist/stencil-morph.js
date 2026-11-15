const width = 384;
const height = 144;
const frameCount = 6;
const holdMs = 180;
const morphMs = 380;
const stepMs = holdMs + morphMs;
const spriteUrl = new URL('./media/portfolio/stencil-morph.webp', import.meta.url);

const smoothstep = (value) => value * value * (3 - 2 * value);

// Squared Euclidean distance transform of a line, in linear time. The
// breakpoints delimit the lower envelope of the candidate parabolas.
function transformLine(input, output, length, sites, breakpoints, closest) {
  let last = 0;
  sites[0] = 0;
  breakpoints[0] = -Infinity;
  breakpoints[1] = Infinity;

  for (let position = 1; position < length; position++) {
    let boundary;
    do {
      const site = sites[last];
      boundary = (input[position] + position ** 2 - input[site] - site ** 2) / (2 * (position - site));
      if (boundary > breakpoints[last]) break;
      last--;
    } while (last >= 0);
    last++;
    sites[last] = position;
    breakpoints[last] = boundary;
    breakpoints[last + 1] = Infinity;
  }

  let active = 0;
  for (let position = 0; position < length; position++) {
    while (breakpoints[active + 1] < position) active++;
    const site = sites[active];
    output[position] = (position - site) ** 2 + input[site];
    closest[position] = site;
  }
}

function distanceTransform(mask, target, texture, image) {
  const distances = new Float32Array(mask.length);
  const lineLength = Math.max(width, height);
  const input = new Float64Array(lineLength);
  const output = new Float64Array(lineLength);
  const sites = new Int32Array(lineLength);
  const breakpoints = new Float64Array(lineLength + 1);
  const closest = new Int32Array(lineLength);
  const closestColumns = texture && new Int32Array(mask.length);
  // A finite upper bound also handles rows and columns without target pixels.
  const missing = width ** 2 + height ** 2;

  for (let row = 0; row < height; row++) {
    const start = row * width;
    for (let x = 0; x < width; x++) input[x] = mask[start + x] === target ? 0 : missing;
    transformLine(input, output, width, sites, breakpoints, closest);
    distances.set(output.subarray(0, width), start);
    if (closestColumns) closestColumns.set(closest.subarray(0, width), start);
  }

  for (let x = 0; x < width; x++) {
    for (let row = 0; row < height; row++) input[row] = distances[row * width + x];
    transformLine(input, output, height, sites, breakpoints, closest);
    for (let row = 0; row < height; row++) {
      const pixel = row * width + x;
      distances[pixel] = output[row];
      if (texture) {
        const closestRow = closest[row];
        const inkPixel = closestRow * width + closestColumns[closestRow * width + x];
        texture[pixel] = image.data[inkPixel * 4 + 3];
      }
    }
  }

  return distances;
}

function distanceField(image) {
  const mask = new Uint8Array(width * height);
  let ink = 0;
  for (let pixel = 0; pixel < mask.length; pixel++) {
    if (image.data[pixel * 4 + 3] < 45) continue;
    mask[pixel] = 1;
    ink++;
  }
  if (!ink || ink === mask.length) throw new Error('Stencil tile needs ink and transparency');

  const inside = distanceTransform(mask, 0);
  // Carry the actual ink density of the nearest stroke into the surrounding
  // field so moving edges keep the stencil's photographed texture.
  const texture = new Uint8Array(mask.length);
  const outside = distanceTransform(mask, 1, texture, image);
  for (let pixel = 0; pixel < inside.length; pixel++) {
    // Far-away space should not swallow a nearby thin stroke prematurely.
    const distance = mask[pixel] ? Math.sqrt(inside[pixel]) - 0.5 : 0.5 - Math.sqrt(outside[pixel]);
    inside[pixel] = Math.max(-18, Math.min(18, distance));
  }
  return { field: inside, texture };
}

function drawTransition(context, output, first, second, progress) {
  const time = smoothstep(progress);
  const startBlend = smoothstep(Math.max(0, 1 - time * 7));
  const endBlend = smoothstep(Math.max(0, 1 - (1 - time) * 7));
  for (let pixel = 0; pixel < first.field.length; pixel++) {
    const offset = pixel * 4 + 3;
    const distance = first.field[pixel] * (1 - time) + second.field[pixel] * time;
    const coverage = smoothstep(Math.min(1, Math.max(0, 0.5 + distance / 1.6)));
    const density = first.texture[pixel] * (1 - time) + second.texture[pixel] * time;
    const alpha = density * coverage * (1 - startBlend - endBlend)
      + first.image.data[offset] * startBlend + second.image.data[offset] * endBlend;
    output.data[offset] = alpha;
  }
  context.putImageData(output, 0, 0);
}

function prepareFrames(sprite) {
  if (sprite.naturalWidth !== width || sprite.naturalHeight !== height * frameCount) {
    throw new Error('Unexpected stencil sprite dimensions');
  }
  const strip = document.createElement('canvas');
  strip.width = width;
  strip.height = height * frameCount;
  const context = strip.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Stencil canvas is unavailable');
  context.drawImage(sprite, 0, 0);

  return Array.from({ length: frameCount }, (_, index) => {
    const image = context.getImageData(0, index * height, width, height);
    return { image, ...distanceField(image) };
  });
}

function attachMorph(wrapper) {
  const canvas = wrapper.querySelector('canvas');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = width;
  canvas.height = height;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const output = context.createImageData(width, height);
  for (let offset = 0; offset < output.data.length; offset += 4) {
    output.data[offset] = 230;
    output.data[offset + 1] = 229;
    output.data[offset + 2] = 227;
  }

  let frames;
  let attempted = false;
  let visible = !('IntersectionObserver' in window);
  let animation = 0;
  let lastTime;
  let elapsed = 0;
  let heldFrame = -1;

  const shouldRun = () => visible && !document.hidden && !reduced.matches;

  function paint() {
    const index = Math.floor(elapsed / stepMs);
    const position = elapsed % stepMs;
    if (position < holdMs) {
      if (index !== heldFrame) context.putImageData(frames[index].image, 0, 0);
      heldFrame = index;
      return;
    }
    heldFrame = -1;
    const next = (index + 1) % frameCount;
    drawTransition(context, output, frames[index], frames[next], (position - holdMs) / morphMs);
  }

  function tick(now) {
    animation = 0;
    if (!shouldRun()) return;
    lastTime ??= now;
    const delta = now - lastTime;
    if (delta >= 28) {
      elapsed = (elapsed + Math.min(delta, 75)) % (frameCount * stepMs);
      lastTime = now;
      paint();
    }
    animation = window.requestAnimationFrame(tick);
  }

  async function load() {
    attempted = true;
    try {
      const sprite = new Image();
      sprite.src = wrapper.dataset.morphSrc || spriteUrl.href;
      await sprite.decode();
      frames = prepareFrames(sprite);
      synchronize();
    } catch {
      // Leave the site's static image in place when media or canvas fails.
    }
  }

  function synchronize() {
    if (!shouldRun()) {
      if (animation) window.cancelAnimationFrame(animation);
      animation = 0;
      lastTime = undefined;
      if (reduced.matches) delete wrapper.dataset.morphReady;
      return;
    }
    if (!frames) {
      if (!attempted) void load();
      return;
    }
    if (animation) return;
    paint();
    wrapper.dataset.morphReady = '';
    animation = window.requestAnimationFrame(tick);
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      synchronize();
    });
    observer.observe(wrapper);
  }
  if (reduced.addEventListener) reduced.addEventListener('change', synchronize);
  else reduced.addListener(synchronize);
  document.addEventListener('visibilitychange', synchronize);
  synchronize();
}

for (const wrapper of document.querySelectorAll('[data-stencil-morph]')) attachMorph(wrapper);
