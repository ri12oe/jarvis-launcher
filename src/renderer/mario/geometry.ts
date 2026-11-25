/** Point at `deg` degrees clockwise from 12 o'clock. */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

const f = (value: number) => value.toFixed(2);

/** SVG arc from a0 to a1 degrees, clockwise. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 ${large} 1 ${f(x1)} ${f(y1)}`;
}

/** Quadrilateral plate between two radii, with straight edges like the design's chips. */
export function plate(cx: number, cy: number, inner: number, outer: number, a0: number, a1: number): string {
  const points = [polar(cx, cy, inner, a0), polar(cx, cy, outer, a0), polar(cx, cy, outer, a1), polar(cx, cy, inner, a1)];
  return `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
}

/** Filled ring segment between two radii. */
export function band(cx: number, cy: number, inner: number, outer: number, a0: number, a1: number): string {
  const [ox0, oy0] = polar(cx, cy, outer, a0);
  const [ox1, oy1] = polar(cx, cy, outer, a1);
  const [ix1, iy1] = polar(cx, cy, inner, a1);
  const [ix0, iy0] = polar(cx, cy, inner, a0);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return (
    `M${f(ox0)} ${f(oy0)}A${f(outer)} ${f(outer)} 0 ${large} 1 ${f(ox1)} ${f(oy1)}` +
    `L${f(ix1)} ${f(iy1)}A${f(inner)} ${f(inner)} 0 ${large} 0 ${f(ix0)} ${f(iy0)}Z`
  );
}

export function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}
