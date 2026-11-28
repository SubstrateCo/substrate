import { fmt } from "../geometry/path.ts";

export type Matrix = [a: number, b: number, c: number, d: number, e: number, f: number];

function multiply(l: Matrix, r: Matrix): Matrix {
  const [a, b, c, d, e, f] = l;
  const [ra, rb, rc, rd, re, rf] = r;
  return [
    a * ra + c * rb,
    b * ra + d * rb,
    a * rc + c * rd,
    b * rc + d * rd,
    a * re + c * rf + e,
    b * re + d * rf + f,
  ];
}

export const translation = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scaling = (x: number, y = x): Matrix => [x, 0, 0, y, 0, 0];
export function rotation(degrees: number): Matrix {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, 0, 0];
}

export function compose(...matrices: Matrix[]): Matrix {
  const out = matrices.reduce(multiply, [1, 0, 0, 1, 0, 0]);
  return [fmt(out[0]), fmt(out[1]), fmt(out[2]), fmt(out[3]), fmt(out[4]), fmt(out[5])];
}
