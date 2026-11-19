const COURT = Object.freeze({
  halfWidth: 2.55,
  halfLength: 7.15,
  kitchenLine: 2.13
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const signForTeam = team => team === 0 ? 1 : -1;

export function predictIntercept(ball, velocity, team, maxTime = 0.32) {
  const speedZ = Math.max(2.8, Math.abs(velocity?.z || 0));
  const time = clamp(Math.abs((ball?.z || 0)) / speedZ * 0.18, 0.04, maxTime);
  const x = clamp((ball?.x || 0) + (velocity?.x || 0) * time, -2.35, 2.35);
  const z = clamp((ball?.z || 0) + (velocity?.z || 0) * time,
    team === 0 ? 1.15 : -7.05,
    team === 0 ? 7.05 : -1.15);
  return { x, z, time };
}

/**
 * Assign one doubles partner to the ball and keep the other in a useful
 * covering position. Human teammates participate in the nearest-player check,
 * so the bot does not blindly chase a ball already covered by its partner.
 */
export function assignDoublesRoles(players, team, ball, velocity) {
  const teammates = (players || []).filter(player => player.team === team);
  if (!teammates.length) return [];
  const ballSide = (ball?.z || 0) >= 0 ? 0 : 1;
  const side = signForTeam(team);
  if (ballSide !== team) {
    return [...teammates].sort((a, b) => a.slot - b.slot).map((player, index) => ({
      id: player.id,
      role: "advance",
      targetX: teammates.length > 1 ? (index === 0 ? -1.35 : 1.35) : clamp(player.x, -1.5, 1.5),
      targetZ: side * 2.58,
      interceptX: ball?.x || 0,
      interceptZ: ball?.z || 0
    }));
  }
  const intercept = predictIntercept(ball, velocity, team);
  const chaser = teammates.reduce((best, player) => {
    const distance = Math.hypot(player.x - intercept.x, player.z - intercept.z);
    return !best || distance < best.distance ? { id: player.id, distance } : best;
  }, null);
  const side = signForTeam(team);
  const ballX = clamp(ball?.x || 0, -2.2, 2.2);
  const supportX = ballX >= 0 ? -1.45 : 1.45;
  const supportZ = side * (Math.abs(ball?.z || 0) > 4.4 ? 3.85 : 2.58);

  return teammates.map(player => {
    const isChaser = player.id === chaser.id;
    return {
      id: player.id,
      role: isChaser ? "chaser" : "cover",
      targetX: isChaser ? intercept.x : supportX,
      targetZ: isChaser ? intercept.z : supportZ,
      interceptX: intercept.x,
      interceptZ: intercept.z
    };
  });
}

function bestOpenLane(opponents) {
  const candidates = [-2.15, -1.25, 0, 1.25, 2.15];
  if (!opponents?.length) return 0;
  return candidates.reduce((best, candidate) => {
    const clearance = Math.min(...opponents.map(player => Math.abs(candidate - player.x)));
    const edgePenalty = Math.abs(candidate) * 0.035;
    const score = clearance - edgePenalty;
    return !best || score > best.score ? { x: candidate, score } : best;
  }, null).x;
}

/**
 * A compact tactical policy for training bots. The target lane is selected
 * from defender spacing; shot choice depends on contact height and court shape.
 */
export function chooseBotShot({ ball, player, opponents = [] }) {
  const height = Number.isFinite(ball?.y) ? ball.y : 0.5;
  const depth = Math.abs(Number.isFinite(ball?.z) ? ball.z : 0);
  const opponentsAtKitchen = opponents.filter(opponent =>
    Math.abs(opponent.z) <= COURT.kitchenLine + 1.05
  ).length;
  const openLaneX = bestOpenLane(opponents);
  let shot = "drive";

  if (height >= 2.35 && depth <= 4.1) {
    shot = "smash";
  } else if (opponents.length >= 2 && opponentsAtKitchen === opponents.length && height >= 1.25) {
    shot = "lob";
  } else if (depth <= 3.35 && height <= 1.35) {
    shot = "dink";
  } else if (Math.abs(openLaneX - (player?.x || 0)) >= 2.0 && height <= 1.8) {
    shot = "slice";
  }

  return {
    shot,
    targetX: clamp(openLaneX, -2.35, 2.35),
    targetZ: -signForTeam(player?.team ?? 0) * (shot === "dink" ? 2.55 : 5.35)
  };
}

export function shouldBotContestBall({ player, ball, velocity, expectedBounceTeam, cooldown = 0 }) {
  if (!player || !ball || cooldown > 0 || expectedBounceTeam === player.team) return false;
  const distance = Math.hypot((ball.x || 0) - player.x, (ball.z || 0) - player.z);
  const approach = (velocity?.z || 0) * signForTeam(player.team) < 0.25;
  return distance <= 1.5 && (approach || Math.abs(velocity?.z || 0) < 2.5);
}
