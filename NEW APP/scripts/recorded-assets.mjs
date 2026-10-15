import { inflateSync } from 'node:zlib';
import { MAX_ASSET_BYTES, safeAssetName, publicationSha256 } from '../src/platform/recorded-publication.ts';

// Literal PNG chunk bytes, not lossy ASCII-decoded names.
const IHDR = 0x49484452, IDAT = 0x49444154, IEND = 0x49454e44;
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
export function pngCrc(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/**
 * Narrow public media profile: complete, noninterlaced, 8-bit RGB/RGBA PNG.
 * Only IHDR/IDAT/IEND are allowed: no EXIF, text, profiles, timestamps, animation,
 * trailers or arbitrary JSON. Visible content/licensing remains capture review.
 */
export function validatePublicAsset(name, bytes) {
  if (!safeAssetName(name) || !Buffer.isBuffer(bytes) || bytes.length > MAX_ASSET_BYTES || bytes.length < 57) throw new Error('invalid-public-asset');
  if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('invalid-png-signature');
  let offset = 8, width = 0, height = 0, channels = 0, ended = false, idat = false;
  const compressed = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('truncated-png');
    const length = bytes.readUInt32BE(offset), type = bytes.readUInt32BE(offset + 4);
    if (length > MAX_ASSET_BYTES || offset + 12 + length > bytes.length) throw new Error('truncated-png');
    if (pngCrc(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) throw new Error('invalid-png-crc');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === IHDR) {
      if (offset !== 8 || length !== 13) throw new Error('invalid-png-header');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      channels = data[9] === 2 ? 3 : data[9] === 6 ? 4 : 0;
      if (!width || !height || width > 2048 || height > 2048 || width * height > 4 * 1024 * 1024 || !channels
        || data[8] !== 8 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error('unsupported-png-profile');
    } else if (type === IDAT) {
      if (!width || ended || !length) throw new Error('invalid-png-data');
      idat = true; compressed.push(data);
    } else if (type === IEND) {
      if (length !== 0 || !idat || ended || offset + 12 !== bytes.length) throw new Error('invalid-png-end');
      ended = true;
    } else {
      throw new Error('png-metadata-or-chunk-refused');
    }
    offset += 12 + length;
  }
  if (!ended) throw new Error('incomplete-png');
  const expected = (1 + width * channels) * height;
  const compressedBytes = Buffer.concat(compressed);
  const decoded = inflateSync(compressedBytes, { maxOutputLength: expected + 1, info: true });
  if (decoded.buffer.length !== expected || decoded.engine.bytesWritten !== compressedBytes.length) throw new Error('invalid-png-pixels');
  for (let row = 0; row < height; row++) if (decoded.buffer[row * (1 + width * channels)] > 4) throw new Error('invalid-png-filter');
  return { bytes: bytes.length, sha256: publicationSha256(bytes) };
}
