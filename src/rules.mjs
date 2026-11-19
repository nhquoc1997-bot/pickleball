export const PICKLEBALL_RULES = Object.freeze({
  targetScore: 11,
  winBy: 2,
  halfCourtWidth: 3.05,
  halfCourtLength: 6.705,
  kitchenDepth: 2.13,
  ballRadius: 0.037
});

// Coordinates: Team 0 plays from +Z and Team 1 from -Z.
// Their right-hand service courts therefore sit on opposite X sides.
export function rightCourtSign(team) {
  return team === 0 ? 1 : -1;
}

export function isInKitchen(player, kitchenDepth = PICKLEBALL_RULES.kitchenDepth, margin = 0.12) {
  if (!player || !Number.isFinite(player.z)) return false;
  // The non-volley zone is the strip on both sides of the net.
  return Math.abs(player.z) <= kitchenDepth + margin;
}

export function isValidServeLanding({
  x, z, servingTeam, targetX,
  halfWidth = PICKLEBALL_RULES.halfCourtWidth,
  halfLength = PICKLEBALL_RULES.halfCourtLength,
  kitchenDepth = PICKLEBALL_RULES.kitchenDepth,
  ballRadius = PICKLEBALL_RULES.ballRadius
}) {
  if (![x, z, servingTeam, targetX].every(Number.isFinite) || Math.sign(targetX) === 0) return false;
  const receivingTeam = 1 - servingTeam;
  const onReceivingHalf = receivingTeam === 0 ? z > 0 : z < 0;
  const beyondKitchen = receivingTeam === 0
    ? z > kitchenDepth + ballRadius
    : z < -kitchenDepth - ballRadius;
  const insideCourt = Math.abs(x) <= halfWidth + ballRadius
    && Math.abs(z) <= halfLength + ballRadius;
  const diagonalServiceBox = Math.sign(x) === Math.sign(targetX);
  return onReceivingHalf && beyondKitchen && insideCourt && diagonalServiceBox;
}

// Doubles side-out: server 1 hands the serve to server 2; after server 2
// loses, the other team serves with the player already on its right-hand side.
export function nextServeState({ score, servingTeam, serverIndex, serverNumber, players, winner }) {
  const nextScore = [...score];
  const servingPlayers = players.filter(player => player.team === servingTeam);

  if (winner === servingTeam) {
    nextScore[servingTeam] += 1;
    return {
      score: nextScore, servingTeam, serverIndex, serverNumber,
      switchSides: servingPlayers.length > 1
    };
  }

  if (serverNumber === 1 && servingPlayers.length > 1) {
    return {
      score: nextScore, servingTeam,
      serverIndex: (serverIndex + 1) % servingPlayers.length,
      serverNumber: 2,
      switchSides: false
    };
  }

  const nextTeam = winner;
  const nextTeamPlayers = players.filter(player => player.team === nextTeam);
  const rightSign = rightCourtSign(nextTeam);
  const rightSideIndex = nextTeamPlayers.findIndex(player => player.x * rightSign > 0);
  return {
    score: nextScore,
    servingTeam: nextTeam,
    serverIndex: rightSideIndex >= 0 ? rightSideIndex : 0,
    serverNumber: 1,
    switchSides: false
  };
}

export function isMatchWon(score, team, targetScore = PICKLEBALL_RULES.targetScore, winBy = PICKLEBALL_RULES.winBy) {
  return score[team] >= targetScore && score[team] - score[1 - team] >= winBy;
}
