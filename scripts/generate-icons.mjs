// Generates placeholder ribbon/task-pane icons as solid PNGs.
// Uses only Node built-ins (zlib.crc32 + deflateSync), no image deps.
import { writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIZES = [16, 32, 64, 80, 128];
const COLOR = [0x5b, 0x5f, 0xef]; // indigo — matches the task pane accent

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: 2 = truecolor RGB
  // bytes 10-12 already 0 (compression/filter/interlace)

  const rowLen = size * 3;
  const raw = Buffer.alloc(size * (rowLen + 1));
  for (let y = 0; y < size; y++) {
    const off = y * (rowLen + 1);
    raw[off] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const p = off + 1 + x * 3;
      raw[p] = COLOR[0];
      raw[p + 1] = COLOR[1];
      raw[p + 2] = COLOR[2];
    }
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
for (const size of SIZES) {
  writeFileSync(join(outDir, `icon-${size}.png`), makePng(size));
  console.log(`wrote public/icon-${size}.png`);
}
