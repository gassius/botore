/**
 * 2D affine helpers for Workshop Frame kit hierarchy.
 * Column-vector: point' = M × [x, y, 1].
 * Matches kit README: Translate × Rotate × Translate(-pivot).
 */

export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export function identity(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function translate(tx: number, ty: number): Mat3 {
  return [1, 0, tx, 0, 1, ty, 0, 0, 1];
}

/** Clockwise degrees (kit convention). */
export function rotateCwDeg(degrees: number): Mat3 {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // Clockwise: [[c, s], [-s, c]] in row form for column vectors →
  // x' = c*x + s*y ; y' = -s*x + c*y
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

export function transformPoint(m: Mat3, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[1] * y + m[2],
    y: m[3] * x + m[4] * y + m[5],
  };
}

/** Extract translation of origin and clockwise rotation degrees (uniform rotate+translate). */
export function decomposeTranslateRotate(m: Mat3): {
  x: number;
  y: number;
  rotateCwDeg: number;
} {
  const x = m[2];
  const y = m[5];
  const rotateCwDeg = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  return { x, y, rotateCwDeg };
}

/**
 * Child local→parent: Translate(parent_socket) × Rotate(angle) × Translate(-child_pivot)
 */
export function childLocalMatrix(
  parentSocketX: number,
  parentSocketY: number,
  angleCwDeg: number,
  pivotX: number,
  pivotY: number,
): Mat3 {
  return multiply(
    multiply(translate(parentSocketX, parentSocketY), rotateCwDeg(angleCwDeg)),
    translate(-pivotX, -pivotY),
  );
}
