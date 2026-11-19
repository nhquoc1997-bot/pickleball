export const RECONNECT_GRACE_MS = 30_000;

export function findResumablePlayer(players, token, now = Date.now()) {
  if (typeof token !== "string" || token.length < 16) return null;
  return (players || []).find(player =>
    player.resumeToken === token &&
    player.connected === false &&
    Number.isFinite(player.disconnectUntil) &&
    player.disconnectUntil >= now
  ) || null;
}

export function findAvailableSlot(players, now = Date.now(), maxPlayers = 4) {
  const occupied = new Set((players || [])
    .filter(player => player.connected !== false ||
      (Number.isFinite(player.disconnectUntil) && player.disconnectUntil >= now))
    .map(player => player.slot));
  for (let slot = 0; slot < maxPlayers; slot++) {
    if (!occupied.has(slot)) return slot;
  }
  return -1;
}

export function expireDisconnectedPlayers(players, now = Date.now()) {
  return (players || []).filter(player =>
    player.connected !== false ||
    !Number.isFinite(player.disconnectUntil) ||
    player.disconnectUntil > now
  );
}

export function roomPresence(players, maxPlayers = 4) {
  const list = players || [];
  const connected = list.filter(player => player.connected !== false).length;
  const reconnecting = list.length - connected;
  return {
    connected,
    reconnecting,
    available: Math.max(0, maxPlayers - list.length),
    full: connected >= maxPlayers
  };
}
