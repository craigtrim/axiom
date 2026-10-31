// craigtrim/axiom#188: the ceilings measured in Chromium and the file formats, and how large exports are cut into bands.
export const CANVAS_SIDE = 65535;
export const CANVAS_AREA = 268435456;
export const WEBP_SIDE = 16383;
export const JPEG_SIDE = 65500;
export const BMP_MAX_BYTES = 4294967295;
const CLASSIC_TIFF_MAX = 4294967295;
/** Pixels rendered and sent per band, so a band holds 64 MB of RGBA. */
export const BAND_PIXELS = 16777216;
export const fitsCanvas = (width: number, height: number) =>
  width <= CANVAS_SIDE &&
  height <= CANVAS_SIDE &&
  width * height <= CANVAS_AREA;
/** Rows per band for an image this wide. */
export const bandRows = (width: number, height: number) =>
  Math.max(1, Math.min(height, Math.floor(BAND_PIXELS / width)));
/** Column widths that keep every tile inside one canvas. */
export function tileColumns(width: number) {
  const count = Math.ceil(width / CANVAS_SIDE),
    columns: { x: number; width: number }[] = [];
  for (let i = 0, x = 0; i < count; i++) {
    const w = Math.ceil((width - x) / (count - i));
    columns.push({ x, width: w });
    x += w;
  }
  return columns;
}
export const bmpStride = (width: number) => Math.ceil((width * 3) / 4) * 4;
export const bmpBytes = (width: number, height: number) =>
  54 + bmpStride(width) * height;
/** Classic TIFF while every offset fits in 32 bits, BigTIFF beyond. */
export function tiffLayout(
  width: number,
  height: number,
  classicLimit = CLASSIC_TIFF_MAX,
) {
  const row = width * 4,
    rowsPerStrip = Math.max(1, Math.min(height, Math.floor(1048576 / row))),
    strips = Math.ceil(height / rowsPerStrip),
    entries = 14;
  for (const big of [false, true]) {
    const word = big ? 8 : 4,
      header = big ? 16 : 8,
      ifd = big ? 8 + entries * 20 + 8 : 2 + entries * 12 + 4,
      // Classic TIFF keeps BitsPerSample and both resolutions outside the entries.
      extra = big ? 0 : 24,
      arrays = strips > 1 ? 2 * strips * word : 0,
      dataOffset = header + ifd + extra + arrays,
      total = dataOffset + row * height;
    if (big || total <= classicLimit)
      return {
        big,
        rowsPerStrip,
        strips,
        header,
        ifd,
        extra,
        dataOffset,
        total,
      };
  }
  throw Error("Unreachable TIFF layout.");
}
const count = (n: number) => n.toLocaleString("en-GB");
/** The format's own ceiling, or "" when the image fits it. */
export function formatCeiling(format: string, width: number, height: number) {
  const side = Math.max(width, height);
  if (format === "webp" && side > WEBP_SIDE)
    return (
      "WebP supports up to " +
      count(WEBP_SIDE) +
      " pixels per side. Choose PNG to export this size."
    );
  if (format === "jpg" && side > JPEG_SIDE)
    return (
      "JPEG supports up to " +
      count(JPEG_SIDE) +
      " pixels per side. Choose PNG to export this size."
    );
  if (format === "jpg" && width * height > CANVAS_AREA)
    return (
      "JPEG supports up to " +
      count(JPEG_SIDE) +
      " pixels per side. Axiom's JPEG encoder also requires the image to fit within " +
      count(CANVAS_AREA) +
      " pixels. Choose PNG to export this size."
    );
  if (format === "bmp" && bmpBytes(width, height) > BMP_MAX_BYTES)
    return (
      "BMP files hold up to " +
      count(BMP_MAX_BYTES) +
      " bytes, and this image needs " +
      count(bmpBytes(width, height)) +
      ". Choose PNG to export this size."
    );
  if (format === "clipboard" && !fitsCanvas(width, height))
    return (
      "This image is too large for the clipboard, which takes up to " +
      count(CANVAS_SIDE) +
      " pixels per side and " +
      count(CANVAS_AREA) +
      " pixels. Choose PNG to export this size."
    );
  return "";
}
/** A note for a TIFF that will be written as BigTIFF, or "". */
export const bigTiffNote = (format: string, width: number, height: number) =>
  format === "tiff" && tiffLayout(width, height).big
    ? "This TIFF passes 4 GB, so Axiom writes it as BigTIFF, which some viewers such as Windows Photos cannot open. Choose PNG for those viewers."
    : "";
/** PNG, TIFF and BMP send pixel rows; everything else sends finished bytes. */
export const sendsRows = (format: string, width: number, height: number) =>
  format === "tiff" ||
  format === "bmp" ||
  (format === "png" && !fitsCanvas(width, height));
