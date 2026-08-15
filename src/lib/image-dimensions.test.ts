import { describe, expect, it } from "vitest";
import { readDimensions } from "./image-dimensions";

/**
 * Headers are constructed by hand rather than shipping binary fixtures: the
 * parser only ever reads the first few dozen bytes, so a synthetic header
 * exercises exactly the code under test and keeps the repo free of blobs.
 */

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0); // \x89PNG
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(13, 8); // IHDR length
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function gifHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(13);
  buffer.write("GIF89a", 0, "ascii");
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

function jpegHeader(width: number, height: number, precedingSegments = true): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];

  if (precedingSegments) {
    // A realistic JFIF APP0 segment that must be skipped over, not misread.
    const app0 = Buffer.alloc(18);
    app0.writeUInt16BE(0xffe0, 0);
    app0.writeUInt16BE(16, 2); // segment length
    app0.write("JFIF\0", 4, "ascii");
    parts.push(app0);
  }

  const sof0 = Buffer.alloc(11);
  sof0.writeUInt16BE(0xffc0, 0);
  sof0.writeUInt16BE(9, 2); // length excluding the marker
  sof0.writeUInt8(8, 4); // sample precision
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  parts.push(sof0);

  return Buffer.concat(parts);
}

function webpLossyHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(32);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(24, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8 ", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUInt16LE(width & 0x3fff, 26);
  buffer.writeUInt16LE(height & 0x3fff, 28);
  return buffer;
}

function webpExtendedHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(32);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

describe("readDimensions", () => {
  it("reads PNG", () => {
    expect(readDimensions(pngHeader(1200, 630))).toEqual({
      width: 1200,
      height: 630,
    });
  });

  it("reads GIF", () => {
    expect(readDimensions(gifHeader(800, 600))).toEqual({ width: 800, height: 600 });
  });

  it("reads JPEG, skipping preceding segments", () => {
    // The common failure mode is reading the APP0 segment as the frame header.
    expect(readDimensions(jpegHeader(1920, 1080))).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("reads a JPEG whose frame header comes first", () => {
    expect(readDimensions(jpegHeader(640, 480, false))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("reads lossy WebP", () => {
    expect(readDimensions(webpLossyHeader(1024, 768))).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it("reads extended WebP", () => {
    expect(readDimensions(webpExtendedHeader(2000, 1500))).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it("returns null for a non-image", () => {
    expect(readDimensions(Buffer.from("<!doctype html><html>"))).toBeNull();
  });

  it("returns null rather than throwing on a truncated header", () => {
    // Ingestion must reject these, not crash the whole run.
    expect(readDimensions(Buffer.alloc(2))).toBeNull();
    expect(readDimensions(pngHeader(100, 100).subarray(0, 10))).toBeNull();
    expect(readDimensions(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it("returns null for an SVG, which is a logo rather than a photo", () => {
    expect(readDimensions(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });

  it("does not loop forever on malformed JPEG segment lengths", () => {
    const malformed = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);
    expect(readDimensions(malformed)).toBeNull();
  });

  it("reads the small dimensions that ingestion must reject", () => {
    // A 100×100 favicon should parse fine and be rejected by the caller's
    // threshold, not silently pass as unreadable.
    expect(readDimensions(pngHeader(100, 100))).toEqual({ width: 100, height: 100 });
  });
});
