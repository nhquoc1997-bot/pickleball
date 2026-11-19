export const MIN_QUALITY = 0;
export const MAX_QUALITY = 2;

export function getRenderProfile(level = 1, isMobile = false, devicePixelRatio = 1) {
  const safeLevel = Math.max(MIN_QUALITY, Math.min(MAX_QUALITY, Math.round(level)));
  const caps = isMobile ? [0.78, 1.0, 1.18] : [1.0, 1.4, 1.75];
  const cap = caps[safeLevel];
  return {
    level: safeLevel,
    pixelRatio: Math.max(0.65, Math.min(Number(devicePixelRatio) || 1, cap)),
    shadows: !isMobile && safeLevel === MAX_QUALITY,
    shadowMapSize: safeLevel === MAX_QUALITY ? 1024 : 512,
    antialias: !isMobile && safeLevel > MIN_QUALITY
  };
}

export function nextRenderQuality(currentLevel, fps, isMobile = false) {
  const level = Math.max(MIN_QUALITY, Math.min(MAX_QUALITY, Math.round(currentLevel)));
  if (!Number.isFinite(fps) || fps <= 0) return level;
  if (fps < 24) return Math.max(MIN_QUALITY, level - 2);
  if (fps < (isMobile ? 32 : 38)) return Math.max(MIN_QUALITY, level - 1);
  if (fps > 58) return Math.min(MAX_QUALITY, level + 1);
  return level;
}
