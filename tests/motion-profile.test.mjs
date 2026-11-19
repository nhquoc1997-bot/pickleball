import test from "node:test";
import assert from "node:assert/strict";
import { getFootworkProfile, getStrokePhase } from "../src/motion-profile.mjs";

test("classifies forward movement in the player's facing direction", () => {
  const profile = getFootworkProfile({ velocityX: 0, velocityZ: -3, rotation: 0 });
  assert.ok(profile.forwardSpeed > 0);
  assert.ok(profile.forwardDrive > 0.8);
  assert.equal(profile.retreat, 0);
});

test("classifies retreat and keeps all blend values bounded", () => {
  const profile = getFootworkProfile({ velocityX: 0, velocityZ: 3.5, rotation: 0 });
  assert.ok(profile.retreat > 0.8);
  assert.equal(profile.forwardDrive, 0);
  for (const key of ["moving", "lateralIntensity", "crossover", "retreat", "forwardDrive"]) {
    assert.ok(profile[key] >= 0 && profile[key] <= 1, key);
  }
});

test("detects lateral shuffle and crossover footwork", () => {
  const profile = getFootworkProfile({ velocityX: 4, velocityZ: 0, rotation: 0 });
  assert.ok(profile.lateralIntensity > 0.9);
  assert.ok(profile.crossover > 0.7);
  assert.equal(profile.forwardDrive, 0);
});

test("rotated athletes retain correct local movement axes", () => {
  const profile = getFootworkProfile({ velocityX: -3, velocityZ: 0, rotation: Math.PI / 2 });
  assert.ok(profile.forwardSpeed > 2.9);
});

test("stroke phases are bounded and progress from wind-up to contact to follow-through", () => {
  const start = getStrokePhase(0);
  const contact = getStrokePhase(0.5);
  const finish = getStrokePhase(1);
  assert.equal(start.strike, 0);
  assert.ok(contact.strike > 0.8);
  assert.equal(finish.followThrough, 1);
  for (const phase of [start, contact, finish]) {
    for (const value of Object.values(phase)) assert.ok(value >= 0 && value <= 1);
  }
});
