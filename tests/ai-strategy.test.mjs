import test from "node:test";
import assert from "node:assert/strict";
import {
  predictIntercept,
  assignDoublesRoles,
  chooseBotShot,
  shouldBotContestBall
} from "../src/ai-strategy.mjs";

test("predicts an intercept inside legal court movement bounds", () => {
  const point = predictIntercept(
    { x: 3.2, y: 0.5, z: 5.8 },
    { x: 8, y: 0, z: -12 },
    0
  );
  assert.ok(point.x <= 2.35 && point.x >= -2.35);
  assert.ok(point.z <= 7.05 && point.z >= 1.15);
  assert.ok(point.time > 0 && point.time <= 0.32);
});

test("assigns only the nearest doubles partner to chase the incoming ball", () => {
  const players = [
    { id: "near", slot: 0, team: 0, x: 0.2, z: 4.8 },
    { id: "cover", slot: 2, team: 0, x: -1.2, z: 4.8 },
    { id: "opponent", slot: 1, team: 1, x: 0, z: -4.5 }
  ];
  const roles = assignDoublesRoles(players, 0,
    { x: 0.2, y: 0.7, z: 4.4 }, { x: 0, y: 0, z: 5 });
  assert.equal(roles.find(role => role.id === "near").role, "chaser");
  assert.equal(roles.find(role => role.id === "cover").role, "cover");
  assert.equal(roles.find(role => role.id === "cover").targetZ, 2.58);
});

test("doubles team advances together to a safe Kitchen-ready line when ball is away", () => {
  const players = [
    { id: "left", slot: 0, team: 0, x: -1, z: 4 },
    { id: "right", slot: 2, team: 0, x: 1, z: 4 }
  ];
  const roles = assignDoublesRoles(players, 0,
    { x: 0.3, y: 1, z: -3 }, { x: 0, y: 0, z: -6 });
  assert.deepEqual(roles.map(role => role.role), ["advance", "advance"]);
  assert.deepEqual(roles.map(role => role.targetX), [-1.35, 1.35]);
  assert.ok(roles.every(role => role.targetZ > 2.13));
});

test("AI chooses a dink for a low ball near the Kitchen", () => {
  const plan = chooseBotShot({
    ball: { x: 0, y: 0.8, z: 2.8 },
    player: { x: 0, team: 0 },
    opponents: [{ x: -1, z: -2.8 }, { x: 1, z: -2.8 }]
  });
  assert.equal(plan.shot, "dink");
});

test("AI chooses a lob over two opponents positioned at the Kitchen", () => {
  const plan = chooseBotShot({
    ball: { x: 0, y: 1.6, z: 4.1 },
    player: { x: 0, team: 0 },
    opponents: [{ x: -1, z: -2.4 }, { x: 1, z: -2.5 }]
  });
  assert.equal(plan.shot, "lob");
});

test("AI chooses a smash for a high attacking ball", () => {
  const plan = chooseBotShot({
    ball: { x: 0.2, y: 2.7, z: 3.4 },
    player: { x: 0, team: 0 },
    opponents: [{ x: -1, z: -4 }, { x: 1, z: -4 }]
  });
  assert.equal(plan.shot, "smash");
});

test("AI chooses a slice to exploit a wide open lane", () => {
  const plan = chooseBotShot({
    ball: { x: 0, y: 1.1, z: 5.2 },
    player: { x: 0, team: 0 },
    opponents: [{ x: -0.1, z: -4 }, { x: 0.2, z: -5 }]
  });
  assert.equal(plan.shot, "slice");
  assert.ok(Math.abs(plan.targetX) > 1.5);
});

test("bot contests only reachable balls when it is allowed to hit", () => {
  const player = { x: 0, z: 3, team: 0 };
  const ball = { x: 0.4, z: 3.4 };
  assert.equal(shouldBotContestBall({
    player, ball, velocity: { z: -4 }, expectedBounceTeam: 1, cooldown: 0
  }), true);
  assert.equal(shouldBotContestBall({
    player, ball, velocity: { z: -4 }, expectedBounceTeam: 0, cooldown: 0
  }), false);
  assert.equal(shouldBotContestBall({
    player, ball, velocity: { z: -4 }, expectedBounceTeam: 1, cooldown: 1
  }), false);
});

test("AI returns a legal target lane inside the doubles court", () => {
  const plan = chooseBotShot({
    ball: { x: 0, y: 1.5, z: 4.5 },
    player: { x: 0, team: 1 },
    opponents: [{ x: -1.8, z: 4.5 }, { x: 1.8, z: 4.5 }]
  });
  assert.ok(plan.targetX >= -2.35 && plan.targetX <= 2.35);
  assert.ok(Number.isFinite(plan.targetZ));
});
