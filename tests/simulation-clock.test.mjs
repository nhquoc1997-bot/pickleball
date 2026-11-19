import test from "node:test";
import assert from "node:assert/strict";
import { advanceFixedSteps, limitPlayerInput } from "../src/simulation-clock.mjs";

test("fixed step accumulator produces the same number of steps across common frame rates", () => {
  const step = 1 / 120;
  const at60 = advanceFixedSteps(0, 1 / 60, step, 8);
  const at30 = advanceFixedSteps(0, 1 / 30, step, 8);
  assert.equal(at60.steps, 2);
  assert.equal(at30.steps, 4);
  assert.ok(at60.accumulator < step);
  assert.ok(at30.accumulator < step);
});

test("fixed step accumulator carries fractional time across frames", () => {
  const first = advanceFixedSteps(0, 0.004, 1 / 120, 8);
  const second = advanceFixedSteps(first.accumulator, 0.005, 1 / 120, 8);
  assert.equal(first.steps, 0);
  assert.equal(second.steps, 1);
  assert.ok(second.accumulator < 1 / 120);
});

test("fixed step accumulator caps catch-up work to prevent a spiral of death", () => {
  const result = advanceFixedSteps(0, 0.1, 1 / 120, 8);
  assert.equal(result.steps, 8);
  assert.equal(result.overloaded, true);
  assert.ok(result.accumulator < 1 / 120);
});

test("movement validator allows normal player movement within court limits", () => {
  const result = limitPlayerInput({
    currentX: 0, currentZ: 4, targetX: 0.12, targetZ: 3.9,
    elapsedSeconds: 1 / 30, team: 0
  });
  assert.equal(result.limited, false);
  assert.equal(result.x, 0.12);
  assert.equal(result.z, 3.9);
});

test("movement validator prevents a guest from teleporting across the court", () => {
  const result = limitPlayerInput({
    currentX: 0, currentZ: 4, targetX: 2.5, targetZ: 7,
    elapsedSeconds: 1 / 30, team: 0
  });
  assert.equal(result.limited, true);
  assert.ok(Math.hypot(result.x, result.z - 4) <= 5.4 / 30 + 0.021);
});

test("movement validator clamps each team to its own half and court width", () => {
  const teamA = limitPlayerInput({
    currentX: 0, currentZ: 4, targetX: 9, targetZ: -5,
    elapsedSeconds: 0.25, team: 0
  });
  const teamB = limitPlayerInput({
    currentX: 0, currentZ: -4, targetX: -9, targetZ: 5,
    elapsedSeconds: 0.25, team: 1
  });
  assert.ok(teamA.x <= 2.55 && teamA.x >= -2.55);
  assert.ok(teamA.z >= 1.1);
  assert.ok(teamB.x <= 2.55 && teamB.x >= -2.55);
  assert.ok(teamB.z <= -1.1);
});

test("invalid input is rejected without propagating NaN", () => {
  const result = limitPlayerInput({
    currentX: 0, currentZ: 4, targetX: NaN, targetZ: Infinity,
    elapsedSeconds: 0.03, team: 0
  });
  assert.equal(result.limited, true);
  assert.equal(result.x, 0);
  assert.equal(result.z, 4);
});
