// Shared by lamps, free lights and windows. Callers choose the error class so
// each settings kind keeps its existing error contract.
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function tileInMap(emf, x, y) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < emf.width &&
    y < emf.height
  );
}

export function finiteRange(value, min, max, label, ErrorType = Error) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new ErrorType(`${label} must be between ${min} and ${max}.`);
  return value;
}

export function hexColor(value, message, ErrorType = Error) {
  if (typeof value !== "string" || !HEX_COLOR.test(value))
    throw new ErrorType(message);
  return value.toLowerCase();
}
