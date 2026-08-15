/**
 * Reads pixel dimensions from image file headers.
 *
 * Mixed-quality imagery looks worse than none, so ingestion rejects anything
 * below a minimum resolution. That check needs dimensions, and dimensions live
 * in the first few hundred bytes of every format we accept — cheaper and more
 * portable than pulling in a native image library for one number.
 */

export type Dimensions = { width: number; height: number };

/** Returns null when the format is unrecognised or the header is truncated. */
export function readDimensions(buffer: Buffer): Dimensions | null {
  return readPng(buffer) ?? readGif(buffer) ?? readWebp(buffer) ?? readJpeg(buffer);
}

function readPng(buffer: Buffer): Dimensions | null {
  // \x89PNG\r\n\x1a\n, then an IHDR chunk whose width/height are big-endian u32.
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGif(buffer: Buffer): Dimensions | null {
  if (buffer.length < 10) return null;
  if (buffer.toString("ascii", 0, 3) !== "GIF") return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readWebp(buffer: Buffer): Dimensions | null {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WEBP") return null;

  const format = buffer.toString("ascii", 12, 16);

  if (format === "VP8 ") {
    // Lossy: 14-bit dimensions follow a 3-byte start code at offset 26.
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (format === "VP8L") {
    // Lossless: 14 bits each, packed into the 4 bytes after the signature byte.
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (format === "VP8X") {
    // Extended: 24-bit canvas dimensions, minus one, little-endian.
    const width = buffer.readUIntLE(24, 3) + 1;
    const height = buffer.readUIntLE(27, 3) + 1;
    return { width, height };
  }

  return null;
}

function readJpeg(buffer: Buffer): Dimensions | null {
  if (buffer.length < 4) return null;
  if (buffer.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    // Markers are 0xFF followed by a type byte; padding 0xFF bytes are legal.
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];

    // SOF0–SOF15 carry the frame dimensions, excluding the four non-SOF markers
    // that share the range (DHT, JPG, DAC, RST).
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    // Standalone markers carry no length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }

  return null;
}
