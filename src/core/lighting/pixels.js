// Complete ImageData-like sprite pixels: positive dimensions, 4 bytes each.
export function isRgbaPixels(pixels) {
  const { width, height, data } = pixels ?? {};
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    Number.isSafeInteger(width * height) &&
    Boolean(data) &&
    data.length >= width * height * 4
  );
}
