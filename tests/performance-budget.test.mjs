import test from "node:test";
import assert from "node:assert/strict";
import { getRenderProfile, nextRenderQuality } from "../src/performance-budget.mjs";

test("mobile render profile limits pixel ratio and disables expensive shadows", () => {
  const profile = getRenderProfile(2, true, 3);
  assert.equal(profile.pixelRatio, 1.18);
  assert.equal(profile.shadows, false);
  assert.equal(profile.antialias, false);
});

test("desktop high quality enables shadows with a bounded device pixel ratio", () => {
  const profile = getRenderProfile(2, false, 2.5);
  assert.equal(profile.pixelRatio, 1.75);
  assert.equal(profile.shadows, true);
  assert.equal(profile.shadowMapSize, 1024);
});

test("low frame rate reduces quality more aggressively", () => {
  assert.equal(nextRenderQuality(2, 22, true), 0);
  assert.equal(nextRenderQuality(2, 30, true), 1);
  assert.equal(nextRenderQuality(1, 30, true), 0);
});

test("stable frame rate preserves current quality and high frame rate restores one level", () => {
  assert.equal(nextRenderQuality(1, 45, true), 1);
  assert.equal(nextRenderQuality(1, 60, true), 2);
  assert.equal(nextRenderQuality(2, 60, true), 2);
});

test("invalid frame rate does not alter selected quality", () => {
  assert.equal(nextRenderQuality(1, NaN, false), 1);
});
