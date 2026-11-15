// Run with Node.js and the libwebp dwebp/cwebp utilities on PATH.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const media = 'media/shop-cutouts';
const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'));

function run(command, args, input) {
  const result = spawnSync(command, args, { input, maxBuffer: 40 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr.toString().trim()}`);
  return result.stdout;
}

function decode(file) {
  const pam = run('dwebp', [file, '-quiet', '-pam', '-o', '-']);
  const headerEnd = pam.indexOf('ENDHDR\n') + 'ENDHDR\n'.length;
  const header = pam.subarray(0, headerEnd).toString();
  const width = Number(header.match(/^WIDTH (\d+)$/m)?.[1]);
  const height = Number(header.match(/^HEIGHT (\d+)$/m)?.[1]);
  const pixels = pam.subarray(headerEnd);
  if (pixels.length !== width * height * 4) throw new Error(`Invalid RGBA image: ${file}`);
  return { pam, pixels, width, height };
}

function isBackdrop(pixels, offset) {
  const red = pixels[offset];
  const green = pixels[offset + 1];
  const blue = pixels[offset + 2];
  const low = Math.min(red, green, blue);
  return low >= 248 && Math.max(red, green, blue) - low <= 7;
}

function isPureWhite(pixels, offset) {
  return pixels[offset] === 255 && pixels[offset + 1] === 255 && pixels[offset + 2] === 255;
}

function backdropMask({ pixels, width, height }) {
  const length = width * height;
  const mask = new Uint8Array(length);
  const queue = new Int32Array(length);
  let tail = 0;
  let whiteBorder = 0;
  for (let index = 0; index < length; index++) {
    if (!isBackdrop(pixels, index * 4)) continue;
    const x = index % width;
    const atBorder = index < width || index >= length - width || x === 0 || x === width - 1;
    mask[index] = 1;
    if (!atBorder) continue;
    if (isPureWhite(pixels, index * 4)) whiteBorder++;
    mask[index] = 2;
    queue[tail++] = index;
  }

  // Tight detail crops can touch the frame. Require a substantial white
  // border without assuming any particular corner is outside the garment.
  if (whiteBorder / (2 * (width + height) - 4) < 0.4) return null;

  function visit(index, mark) {
    if (mask[index] !== 1) return;
    mask[index] = mark;
    queue[tail++] = index;
  }

  function grow(mark) {
    for (let head = 0; head < tail; head++) {
      const index = queue[head];
      const x = index % width;
      if (x > 0) visit(index - 1, mark);
      if (x < width - 1) visit(index + 1, mark);
      if (index >= width) visit(index - width, mark);
      if (index < length - width) visit(index + width, mark);
    }
  }

  grow(2);
  if (tail / length < 0.08 || tail / length > 0.94) return null;

  // A hole between garment parts also shows the studio backdrop. Fill only
  // sizeable, nearly solid pure-white areas so pale woven and printed detail
  // inside the garment stays opaque.
  const minimumHole = Math.max(48, Math.round(length * 0.00012));
  for (let index = 0; index < length; index++) {
    if (mask[index] !== 1) continue;
    tail = 0;
    visit(index, 3);
    grow(3);
    if (tail < minimumHole) continue;
    let pure = 0;
    for (let i = 0; i < tail; i++) pure += Number(isPureWhite(pixels, queue[i] * 4));
    if (pure / tail < 0.97) continue;
    for (let i = 0; i < tail; i++) mask[queue[i]] = 2;
  }
  return mask;
}

function mattePixel(original, pixels, offset, inside, minContrast) {
  // Model the sample as foreground composited over white, using nearby
  // opaque fabric as the foreground color estimate.
  const foreground = [0, 1, 2].map(channel => 255 - original[inside * 4 + channel]);
  const color = [0, 1, 2].map(channel => 255 - original[offset + channel]);
  const strength = foreground.reduce((sum, value) => sum + value ** 2, 0);
  if (strength < minContrast ** 2) return;
  const alpha = color.reduce((sum, value, channel) => sum + value * foreground[channel], 0) / strength;
  const error = color.reduce((sum, value, channel) => sum + Math.abs(value - alpha * foreground[channel]), 0);
  if (alpha < 0.04 || alpha >= 0.94 || error > 18) return;
  const safeAlpha = Math.max(alpha, Math.max(...color) / 255);
  if (Math.round(safeAlpha * 255) >= pixels[offset + 3]) return;
  for (let channel = 0; channel < 3; channel++) {
    pixels[offset + channel] = Math.round(255 - color[channel] / safeAlpha);
  }
  pixels[offset + 3] = Math.round(safeAlpha * 255);
}

function removeWideFringe({ pixels, width, height }, original, mask) {
  // These dark source silhouettes have a wider white transition baked in.
  // Restrict the wider matte to light pixels next to clear background.
  const radius = Math.max(3, Math.round(height / 180));
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const offset = index * 4;
      if (mask[index] === 2 || Math.min(...original.subarray(offset, offset + 3)) < 150) continue;
      for (const [dx, dy] of directions) {
        const insideX = x - dx * (radius + 1);
        const insideY = y - dy * (radius + 1);
        if (insideX < 0 || insideX >= width || insideY < 0 || insideY >= height) continue;
        const inside = insideY * width + insideX;
        if (mask[inside] === 2) continue;
        for (let step = 1; step <= radius; step++) {
          const outsideX = x + dx * step;
          const outsideY = y + dy * step;
          if (outsideX < 0 || outsideX >= width || outsideY < 0 || outsideY >= height) break;
          if (mask[outsideY * width + outsideX] !== 2) continue;
          mattePixel(original, pixels, offset, inside, 152);
          break;
        }
      }
    }
  }
}

function removeWhiteFringe(image, mask, wide) {
  const { pixels, width, height } = image;
  const original = Buffer.from(pixels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const offset = index * 4;
      if (mask[index] === 2) {
        pixels[offset + 3] = 0;
        continue;
      }
      let inwardX = 0;
      let inwardY = 0;
      for (let dy = -1; dy <= 1; dy++) {
        if (y + dy < 0 || y + dy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= width || mask[index + dy * width + dx] !== 2) continue;
          inwardX -= dx;
          inwardY -= dy;
        }
      }
      if (!inwardX && !inwardY) continue;
      const insideX = x + Math.sign(inwardX) * 2;
      const insideY = y + Math.sign(inwardY) * 2;
      if (insideX < 0 || insideY < 0 || insideX >= width || insideY >= height) continue;
      const inside = insideY * width + insideX;
      if (mask[inside] === 2) continue;
      mattePixel(original, pixels, offset, inside, 36);
    }
  }
  if (wide) removeWideFringe(image, original, mask);
}

function trimDetail({ pam, pixels, width, height }) {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Include faint anti-aliased strands and edges without using trace alpha.
      if (pixels[(y * width + x) * 4 + 3] < 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  if (left >= right || top >= bottom) return { pam, width, height };

  const horizontalPadding = Math.max(4, Math.ceil((right - left) * 0.04));
  const verticalPadding = Math.max(4, Math.ceil((bottom - top) * 0.04));
  left = Math.max(0, left - horizontalPadding);
  right = Math.min(width, right + horizontalPadding);
  top = Math.max(0, top - verticalPadding);
  bottom = Math.min(height, bottom + verticalPadding);
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth === width && cropHeight === height) return { pam, width, height };

  const header = Buffer.from(`P7\nWIDTH ${cropWidth}\nHEIGHT ${cropHeight}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`);
  const cropped = Buffer.allocUnsafe(header.length + cropWidth * cropHeight * 4);
  header.copy(cropped);
  for (let y = 0; y < cropHeight; y++) {
    const start = ((top + y) * width + left) * 4;
    pixels.copy(cropped, header.length + y * cropWidth * 4, start, start + cropWidth * 4);
  }
  return { pam: cropped, width: cropWidth, height: cropHeight };
}

const staging = mkdtempSync(join(root, '.shop-cutouts-'));
const destination = join(root, 'dist', media);
const manifest = {};
let skipped = 0;
let bytes = 0;

try {
  mkdirSync(destination, { recursive: true });
  const photos = catalog.products.flatMap(product => [product.cover, ...product.statusPhotos]);
  const covers = new Set(catalog.products.map(product => product.cover.src));
  for (const { src } of photos) {
    if (manifest[src]) continue;
    const image = decode(join(root, 'dist', src));
    const mask = backdropMask(image);
    if (!mask) {
      console.log(`Kept original background: ${src}`);
      skipped++;
      continue;
    }
    removeWhiteFringe(image, mask, /^inf-(102|203)-/.test(basename(src)));
    const cutout = covers.has(src) ? image : trimDetail(image);
    const photo = run('cwebp', ['-quiet', '-q', '88', '-alpha_q', '100', '-sharp_yuv', '-o', '-', '--', '-'], cutout.pam);
    const digest = createHash('sha256').update(photo).digest('hex').slice(0, 12);
    const filename = `${basename(src, '.webp')}-${digest}.webp`;
    const file = join(staging, filename);
    writeFileSync(file, photo);
    const { width, height, pixels } = decode(file);
    let transparent = 0;
    let opaque = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] === 0) transparent++;
      if (pixels[offset] === 255) opaque++;
    }
    if (width !== cutout.width || height !== cutout.height || !transparent || !opaque) {
      throw new Error(`Cutout failed alpha verification: ${src}`);
    }
    manifest[src] = { src: `${media}/${filename}`, width, height };
    bytes += photo.length;
  }

  for (const cutout of Object.values(manifest)) {
    const filename = basename(cutout.src);
    renameSync(join(staging, filename), join(destination, filename));
  }
  const stagedManifest = join(staging, 'shop_cutouts.json');
  writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(stagedManifest, join(root, 'shop_cutouts.json'));
  console.log(`Wrote ${Object.keys(manifest).length} verified cutouts (${bytes} bytes), kept ${skipped} original backgrounds.`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
