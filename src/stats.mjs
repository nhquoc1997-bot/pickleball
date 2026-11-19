export const SHOT_TYPES = Object.freeze(["dink", "slice", "lob", "volley", "drive", "smash"]);

export function createEmptyPlayerStats() {
  return {
    shots: Object.fromEntries(SHOT_TYPES.map(type => [type, 0])),
    contacts: 0,
    serves: 0,
    winners: 0,
    errors: 0,
    serveFaults: 0
  };
}

export function recordPlayerShot(stats, shot, isServe = false) {
  const next = {
    ...createEmptyPlayerStats(),
    ...(stats || {}),
    shots: { ...createEmptyPlayerStats().shots, ...(stats?.shots || {}) }
  };
  if (SHOT_TYPES.includes(shot)) next.shots[shot] += 1;
  next.contacts += 1;
  if (isServe) next.serves += 1;
  return next;
}

export function recordPlayerOutcome(stats, { won = false, error = false, serveFault = false } = {}) {
  const next = {
    ...createEmptyPlayerStats(),
    ...(stats || {}),
    shots: { ...createEmptyPlayerStats().shots, ...(stats?.shots || {}) }
  };
  if (won) next.winners += 1;
  if (error) next.errors += 1;
  if (serveFault) next.serveFaults += 1;
  return next;
}

export function buildMatchReport(players, statsByKey, score, winnerTeam, playedAt = Date.now()) {
  const reportPlayers = [...(players || [])]
    .sort((a, b) => a.slot - b.slot)
    .map(player => ({
      statsKey: player.statsKey || player.id,
      name: String(player.name || "PLAYER").slice(0, 14),
      team: player.team,
      slot: player.slot,
      stats: {
        ...createEmptyPlayerStats(),
        ...(statsByKey?.[player.statsKey || player.id] || {}),
        shots: {
          ...createEmptyPlayerStats().shots,
          ...(statsByKey?.[player.statsKey || player.id]?.shots || {})
        }
      }
    }));
  return {
    playedAt: Number.isFinite(playedAt) ? playedAt : Date.now(),
    score: Array.isArray(score) ? [Number(score[0]) || 0, Number(score[1]) || 0] : [0, 0],
    winnerTeam: winnerTeam === 1 ? 1 : 0,
    players: reportPlayers
  };
}

export function updateCareerRecord(current, match, playerKey) {
  const previous = current && typeof current === "object" ? current : {};
  const player = match?.players?.find(item => item.statsKey === playerKey);
  if (!player) return previous;
  const stats = player.stats || createEmptyPlayerStats();
  const shotTotal = SHOT_TYPES.reduce((sum, type) => sum + (stats.shots?.[type] || 0), 0);
  const won = player.team === match.winnerTeam;
  const recent = {
    playedAt: match.playedAt,
    score: [...match.score],
    winnerTeam: match.winnerTeam,
    result: won ? "W" : "L",
    shots: shotTotal,
    winners: stats.winners || 0,
    errors: stats.errors || 0
  };
  const recentMatches = [recent, ...(Array.isArray(previous.recentMatches) ? previous.recentMatches : [])].slice(0, 10);
  const shots = Object.fromEntries(SHOT_TYPES.map(type => [
    type, (previous.shots?.[type] || 0) + (stats.shots?.[type] || 0)
  ]));
  return {
    matches: (previous.matches || 0) + 1,
    wins: (previous.wins || 0) + (won ? 1 : 0),
    losses: (previous.losses || 0) + (won ? 0 : 1),
    totalShots: (previous.totalShots || 0) + shotTotal,
    winners: (previous.winners || 0) + (stats.winners || 0),
    errors: (previous.errors || 0) + (stats.errors || 0),
    serves: (previous.serves || 0) + (stats.serves || 0),
    serveFaults: (previous.serveFaults || 0) + (stats.serveFaults || 0),
    shots,
    recentMatches
  };
}
