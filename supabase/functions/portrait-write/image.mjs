// Portrait-only header/container inspection; no pixel decoding or transformation.
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_DIMENSION = 2048;
const text = (b, start, count) => String.fromCharCode(...b.subarray(start, start + count));
const invalid = () => { throw new Error('Invalid image'); };
const u24 = (b, p) => b[p] + b[p + 1] * 256 + b[p + 2] * 65536;

export function inspectImage(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length >= 33 && [137,80,78,71,13,10,26,10].every((n, i) => b[i] === n)) {
    if (v.getUint32(8) !== 13 || text(b, 12, 4) !== 'IHDR') invalid();
    const width = v.getUint32(16), height = v.getUint32(20);
    let data = false, end = false;
    for (let p = 8; p < b.length;) {
      if (p + 12 > b.length) invalid();
      const size = v.getUint32(p), kind = text(b, p + 4, 4);
      if (p + 12 + size > b.length) invalid();
      if (kind === 'IHDR' && p !== 8) invalid();
      if (kind === 'IDAT' && size > 0) data = true;
      p += 12 + size;
      if (kind === 'IEND') { if (size !== 0 || p !== b.length) invalid(); end = true; }
    }
    if (!data || !end) invalid();
    return { mime: 'image/png', ext: 'png', width, height };
  }
  if (b.length >= 4 && b[0] === 255 && b[1] === 216) {
    if (b[b.length - 2] !== 255 || b[b.length - 1] !== 217) invalid();
    let size, inScan = false, scanData = false, scans = 0;
    for (let p = 2; p < b.length;) {
      if (inScan) {
        // Entropy bytes are opaque; only distinguish stuffing, restart markers
        // and the next structural marker. Every branch advances or exits the scan.
        if (b[p] !== 255) { p++; scanData = true; continue; }
        const markerStart = p++;
        while (p < b.length && b[p] === 255) p++;
        if (p >= b.length) invalid();
        if (b[p] === 0) { p++; scanData = true; continue; }
        if (b[p] >= 0xd0 && b[p] <= 0xd7) { p++; continue; }
        if (!scanData) invalid();
        inScan = false;
        p = markerStart;
      }
      if (b[p++] !== 255) invalid();
      while (p < b.length && b[p] === 255) p++;
      if (p >= b.length) invalid();
      const marker = b[p++];
      if (marker === 0xd9) {
        if (!size || !scans || p !== b.length) invalid();
        return size;
      }
      if (marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) invalid();
      if (marker === 0x01) continue; // Standalone TEM marker has no length.
      if (p + 2 > b.length) invalid();
      const length = v.getUint16(p);
      if (length < 2 || p + length > b.length - 2) invalid();
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (size || length < 8 || length !== 8 + 3 * b[p + 7]) invalid();
        size = { mime: 'image/jpeg', ext: 'jpg', width: v.getUint16(p + 5), height: v.getUint16(p + 3) };
      }
      if (marker === 0xda) {
        if (!size || length < 6 || length !== 6 + 2 * b[p + 2] || p + length >= b.length - 2) invalid();
        inScan = true; scanData = false; scans++;
      }
      p += length;
    }
    invalid();
  }
  if (b.length >= 20 && text(b, 0, 4) === 'RIFF' && text(b, 8, 4) === 'WEBP') {
    if (v.getUint32(4, true) !== b.length - 8) invalid();
    // https://developers.google.com/speed/webp/docs/riff_container
    const chunks = (start, end) => {
      const result = [];
      for (let p = start; p < end;) {
        if (p + 8 > end) invalid();
        const length = v.getUint32(p + 4, true), next = p + 8 + length + (length % 2);
        if (next > end || (length % 2 && b[next - 1] !== 0)) invalid();
        result.push({ kind: text(b, p, 4), p: p + 8, length }); p = next;
      }
      return result;
    };
    const bitstream = ({ kind, p, length }) => {
      if (kind === 'VP8 ') {
        if (length <= 10 || (b[p] & 1) || text(b, p + 3, 3) !== '\x9d\x01\x2a') invalid();
        return [v.getUint16(p + 6, true) & 0x3fff, v.getUint16(p + 8, true) & 0x3fff];
      }
      if (kind === 'VP8L') {
        if (length <= 5 || b[p] !== 0x2f || (b[p + 4] & 0xe0)) invalid();
        const bits = v.getUint32(p + 1, true);
        return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
      }
      return null;
    };
    const parts = chunks(12, b.length);
    let canvas, animated = false, animHeader = false, images = 0;
    for (const part of parts) {
      const { kind, p, length } = part;
      if (kind === 'VP8X') {
        if (part !== parts[0] || length !== 10) invalid();
        canvas = [u24(b, p + 4) + 1, u24(b, p + 7) + 1]; animated = Boolean(b[p] & 2);
      } else if (kind === 'ANIM') {
        if (!animated || animHeader || length !== 6) invalid(); animHeader = true;
      } else if (kind === 'ANMF') {
        if (!animated || !animHeader || length < 16) invalid();
        const w = u24(b, p + 6) + 1, h = u24(b, p + 9) + 1;
        if (u24(b, p) * 2 + w > canvas[0] || u24(b, p + 3) * 2 + h > canvas[1]) invalid();
        const frames = chunks(p + 16, p + length).map(bitstream).filter(Boolean);
        if (frames.length !== 1 || frames[0][0] !== w || frames[0][1] !== h) invalid();
        images++;
      } else {
        const size = bitstream(part);
        if (size) {
          if (animated || images || (canvas && (canvas[0] !== size[0] || canvas[1] !== size[1]))) invalid();
          canvas = size; images++;
        }
      }
    }
    if (!canvas || !images) invalid();
    return { mime: 'image/webp', ext: 'webp', width: canvas[0], height: canvas[1] };
  }
  invalid();
}
