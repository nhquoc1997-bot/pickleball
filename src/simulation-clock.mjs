const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function advanceFixedSteps(accumulator, frameDelta, step = 1 / 120, maxSteps = 8) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1 / 120;
  const safeDelta = Number.isFinite(frameDelta) ? clamp(frameDelta, 0, 0.1) : 0;
  const total = Math.max(0, accumulator || 0) + safeDelta;
  const available = Math.floor((total + 1e-9) / safeStep);
  const steps = Math.min(available, Math.max(1, Math.floor(maxSteps)));
  const overloaded = available > steps;
  const remainder = overloaded
    ? total - available * safeStep
    : total - steps * safeStep;
  return {
    steps,
    accumulator: Math.max(0, remainder),
    overloaded
  };
}

export function limitPlayerInput({
  currentX, currentZ, targetX, targetZ, elapsedSeconds, team,
  halfWidth = 2.55, maxSpeed = 5.4, slack = 0.02,
  nearBaseline = 1.1, farBaseline = 7.15
}) {
  const safeX = Number.isFinite(currentX) ? currentX : 0;
  const minZ = team === 0 ? nearBaseline : -farBaseline;
  const maxZ = team === 0 ? farBaseline : -nearBaseline;
  const baseX = clamp(safeX, -halfWidth, halfWidth);
  const baseZ = clamp(Number.isFinite(currentZ) ? currentZ : team === 0 ? 4.5 : -4.5, minZ, maxZ);
  if (![targetX, targetZ].every(Number.isFinite)) {
    return { x: baseX, z: baseZ, limited: true, distance: 0 };
  }
  const wantedX = clamp(targetX, -halfWidth, halfWidth);
  const wantedZ = clamp(targetZ, minZ, maxZ);
  const dx = wantedX - baseX;
  const dz = wantedZ - baseZ;
  const distance = Math.hypot(dx, dz);
  const elapsed = clamp(Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0, 0, 0.25);
  const maxDistance = maxSpeed * elapsed + slack;
  const ratio = distance > maxDistance && distance > 0 ? maxDistance / distance : 1;
  return {
    x: clamp(baseX + dx * ratio, -halfWidth, halfWidth),
    z: clamp(baseZ + dz * ratio, minZ, maxZ),
    limited: ratio < 1,
    distance: Math.min(distance, maxDistance)
  };
}
