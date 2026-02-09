import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

function buildIco(pngImages) {
  // ICO container with PNG payloads.
  // Spec: https://en.wikipedia.org/wiki/ICO_(file_format)
  const count = pngImages.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + dir.length;

  pngImages.forEach(({ size, png }, i) => {
    const base = i * 16;
    dir.writeUInt8(size === 256 ? 0 : size, base + 0); // width
    dir.writeUInt8(size === 256 ? 0 : size, base + 1); // height
    dir.writeUInt8(0, base + 2); // palette
    dir.writeUInt8(0, base + 3); // reserved
    dir.writeUInt16LE(1, base + 4); // planes
    dir.writeUInt16LE(32, base + 6); // bit depth
    dir.writeUInt32LE(png.length, base + 8); // image size
    dir.writeUInt32LE(offset, base + 12); // image offset
    offset += png.length;
  });

  return Buffer.concat([header, dir, ...pngImages.map((i) => i.png)]);
}

async function rasterizeSvgToPng(svgBuffer, size) {
  // Higher density makes text edges cleaner when Sharp rasterizes SVG.
  return sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();
}

async function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(scriptPath), '..');

  const faviconSvgPath = path.join(repoRoot, 'public', 'favicon.svg');
  const faviconIcoPath = path.join(repoRoot, 'public', 'favicon.ico');
  const ext48Path = path.join(repoRoot, 'extension', 'icon-48.png');
  const ext128Path = path.join(repoRoot, 'extension', 'icon-128.png');

  const faviconSvg = await fs.readFile(faviconSvgPath);

  const [png16, png32, png48, png128] = await Promise.all([
    rasterizeSvgToPng(faviconSvg, 16),
    rasterizeSvgToPng(faviconSvg, 32),
    rasterizeSvgToPng(faviconSvg, 48),
    rasterizeSvgToPng(faviconSvg, 128),
  ]);

  const ico = buildIco([
    { size: 16, png: png16 },
    { size: 32, png: png32 },
    { size: 48, png: png48 },
  ]);

  await Promise.all([
    fs.writeFile(faviconIcoPath, ico),
    fs.writeFile(ext48Path, png48),
    fs.writeFile(ext128Path, png128),
  ]);

  console.log('Generated icons:', {
    faviconIcoPath,
    ext48Path,
    ext128Path,
  });
}

await main();

