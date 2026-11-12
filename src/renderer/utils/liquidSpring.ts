/** A critically damped-ish lens spring; callers keep the velocity when interrupted. */
export function stepLiquidSpring(position: number, velocity: number, target: number, dt: number) {
  const step = Math.min(1 / 60, Math.max(0, dt));
  const nextVelocity = velocity + ((target - position) * 420 - velocity * 32) * step;
  return { position: position + nextVelocity * step, velocity: nextVelocity };
}

export function nearestTab(center: number, centers: number[]) {
  return centers.reduce(
    (best, value, index) =>
      Math.abs(value - center) < Math.abs(centers[best] - center) ? index : best,
    0
  );
}
