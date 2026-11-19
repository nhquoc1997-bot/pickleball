const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = (value, low, high) => {
  const t = clamp01((value - low) / Math.max(0.0001, high - low));
  return t * t * (3 - 2 * t);
};

/**
 * Resolve movement in the athlete's local forward/lateral axes.
 * Rotation is the root's world yaw; forward is the direction the chest faces.
 */
export function getFootworkProfile({ velocityX = 0, velocityZ = 0, rotation = 0 } = {}) {
  const forwardSpeed = -Math.sin(rotation) * velocityX - Math.cos(rotation) * velocityZ;
  const lateralSpeed = Math.cos(rotation) * velocityX + Math.sin(rotation) * velocityZ;
  const speed = Math.hypot(velocityX, velocityZ);
  const moving = clamp01(speed / 4.5);
  const lateralIntensity = smooth(Math.abs(lateralSpeed), 0.35, 3.2);
  const crossover = smooth(Math.abs(lateralSpeed), 1.65, 3.8) * moving;
  const retreat = smooth(-forwardSpeed, 0.2, 2.4);
  const forwardDrive = smooth(forwardSpeed, 0.2, 2.4);
  return {
    speed, forwardSpeed, lateralSpeed, moving,
    lateralIntensity, crossover, retreat, forwardDrive
  };
}

/** Smooth, bounded blend values for a three-stage pickleball stroke. */
export function getStrokePhase(progress) {
  const p = clamp01(progress);
  const windup = Math.sin(smooth(p, 0, 0.36) * Math.PI * 0.5);
  const strike = Math.sin(smooth(p, 0.25, 0.73) * Math.PI);
  const followThrough = smooth(p, 0.48, 0.94);
  return { windup, strike, followThrough };
}
