import test from "node:test";
import assert from "node:assert/strict";
import {
  isInKitchen,
  isValidServeLanding,
  nextServeState,
  isMatchWon,
  rightCourtSign
} from "../src/rules.mjs";

test("right service court faces opposite X directions for the two ends", () => {
  assert.equal(rightCourtSign(0), 1);
  assert.equal(rightCourtSign(1), -1);
});

test("serve lands legally in the diagonal receiving service court", () => {
  assert.equal(isValidServeLanding({ x: -1.2, z: -4.1, servingTeam: 0, targetX: -1.0 }), true);
  assert.equal(isValidServeLanding({ x: 1.2, z: 4.1, servingTeam: 1, targetX: 1.0 }), true);
});

test("serve faults for Kitchen, wrong diagonal half, own half or out of bounds", () => {
  assert.equal(isValidServeLanding({ x: -1.2, z: -2.0, servingTeam: 0, targetX: -1.0 }), false);
  assert.equal(isValidServeLanding({ x: 1.2, z: -4.1, servingTeam: 0, targetX: -1.0 }), false);
  assert.equal(isValidServeLanding({ x: -1.2, z: 4.1, servingTeam: 0, targetX: -1.0 }), false);
  assert.equal(isValidServeLanding({ x: -3.3, z: -4.1, servingTeam: 0, targetX: -1.0 }), false);
});

test("Kitchen includes the non-volley-zone line and a small body-contact margin", () => {
  assert.equal(isInKitchen({ team: 0, z: 2.2 }), true);
  assert.equal(isInKitchen({ team: 0, z: 2.4 }), false);
  assert.equal(isInKitchen({ team: 1, z: -2.2 }), true);
  assert.equal(isInKitchen({ team: 1, z: -2.4 }), false);
});

test("first server fault passes serve to the partner as server two without scoring", () => {
  const state = nextServeState({
    score: [4, 3], servingTeam: 0, serverIndex: 0, serverNumber: 1,
    players: [{ team: 0, x: 1 }, { team: 0, x: -1 }, { team: 1, x: -1 }, { team: 1, x: 1 }],
    winner: 1
  });
  assert.deepEqual(state, {
    score: [4, 3], servingTeam: 0, serverIndex: 1, serverNumber: 2, switchSides: false
  });
});

test("second server fault causes side-out and selects the new team's right-court player", () => {
  const state = nextServeState({
    score: [4, 3], servingTeam: 0, serverIndex: 1, serverNumber: 2,
    players: [{ team: 0, x: 1 }, { team: 0, x: -1 }, { team: 1, x: -1.5 }, { team: 1, x: 1.5 }],
    winner: 1
  });
  assert.deepEqual(state, {
    score: [4, 3], servingTeam: 1, serverIndex: 0, serverNumber: 1, switchSides: false
  });
});

test("serving team scores, keeps the same server and changes court sides", () => {
  const state = nextServeState({
    score: [4, 3], servingTeam: 0, serverIndex: 1, serverNumber: 2,
    players: [{ team: 0, x: -1 }, { team: 0, x: 1 }],
    winner: 0
  });
  assert.deepEqual(state, {
    score: [5, 3], servingTeam: 0, serverIndex: 1, serverNumber: 2, switchSides: true
  });
});

test("match requires at least 11 and a two-point lead", () => {
  assert.equal(isMatchWon([11, 10], 0), false);
  assert.equal(isMatchWon([11, 9], 0), true);
  assert.equal(isMatchWon([12, 10], 0), true);
  assert.equal(isMatchWon([10, 12], 1), true);
});
