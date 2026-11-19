import test from "node:test";
import assert from "node:assert/strict";
import {
  RECONNECT_GRACE_MS,
  findResumablePlayer,
  findAvailableSlot,
  expireDisconnectedPlayers,
  roomPresence
} from "../src/room-state.mjs";

test("a disconnected player can resume only with the matching token inside grace period", () => {
  const now = 100_000;
  const player = { id: "old-peer", slot: 2, connected: false, resumeToken: "a".repeat(32), disconnectUntil: now + RECONNECT_GRACE_MS };
  assert.equal(findResumablePlayer([player], "a".repeat(32), now), player);
  assert.equal(findResumablePlayer([player], "b".repeat(32), now), null);
  assert.equal(findResumablePlayer([player], "a".repeat(32), now + RECONNECT_GRACE_MS + 1), null);
});

test("free slots exclude active players and temporarily reserved disconnected slots", () => {
  const players = [
    { slot: 0, connected: true },
    { slot: 1, connected: true },
    { slot: 2, connected: false, disconnectUntil: 50_000 }
  ];
  assert.equal(findAvailableSlot(players, 40_000), 3);
  assert.equal(findAvailableSlot(players, 60_000), 2);
});

test("expired disconnected players are removed but connected players remain", () => {
  const players = [
    { id: "active", connected: true },
    { id: "grace", connected: false, disconnectUntil: 20_000 },
    { id: "expired", connected: false, disconnectUntil: 10_000 }
  ];
  assert.deepEqual(expireDisconnectedPlayers(players, 15_000).map(p => p.id), ["active", "grace"]);
  assert.deepEqual(expireDisconnectedPlayers(players, 25_000).map(p => p.id), ["active"]);
});

test("room presence distinguishes connected players from reconnect reservations", () => {
  const presence = roomPresence([
    { connected: true }, { connected: true },
    { connected: false }, { connected: true }
  ]);
  assert.deepEqual(presence, { connected: 3, reconnecting: 1, available: 0, full: false });
  assert.equal(roomPresence([{ connected: true }, { connected: true }, { connected: true }, { connected: true }]).full, true);
});
