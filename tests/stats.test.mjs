import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyPlayerStats,
  recordPlayerShot,
  recordPlayerOutcome,
  buildMatchReport,
  updateCareerRecord
} from "../src/stats.mjs";

test("creates a complete zeroed player stat card", () => {
  const stats = createEmptyPlayerStats();
  assert.equal(stats.contacts, 0);
  assert.equal(stats.shots.dink, 0);
  assert.equal(stats.serveFaults, 0);
});

test("records shot type, contact and serve attempts without mutating previous stats", () => {
  const initial = createEmptyPlayerStats();
  const after = recordPlayerShot(initial, "dink");
  const served = recordPlayerShot(after, "drive", true);
  assert.equal(initial.contacts, 0);
  assert.equal(after.shots.dink, 1);
  assert.equal(served.contacts, 2);
  assert.equal(served.serves, 1);
  assert.equal(served.shots.drive, 1);
});

test("records winners, errors and serve faults", () => {
  const stats = recordPlayerOutcome(createEmptyPlayerStats(), {
    won: true, error: true, serveFault: true
  });
  assert.equal(stats.winners, 1);
  assert.equal(stats.errors, 1);
  assert.equal(stats.serveFaults, 1);
});

test("builds a stable match report sorted by court slot", () => {
  const players = [
    { id: "b", statsKey: "b", name: "B", team: 1, slot: 1 },
    { id: "a", statsKey: "a", name: "A", team: 0, slot: 0 }
  ];
  const report = buildMatchReport(players, { a: recordPlayerShot(createEmptyPlayerStats(), "lob") },
    [11, 8], 0, 1234);
  assert.deepEqual(report.players.map(p => p.name), ["A", "B"]);
  assert.equal(report.players[0].stats.shots.lob, 1);
  assert.equal(report.playedAt, 1234);
});

test("updates local career totals, win/loss record and recent match history", () => {
  const match = {
    playedAt: 1000, score: [11, 9], winnerTeam: 0,
    players: [{ statsKey: "local", team: 0, stats: {
      ...createEmptyPlayerStats(), shots: { ...createEmptyPlayerStats().shots, dink: 4, drive: 2 },
      winners: 2, errors: 1, serves: 3
    } }]
  };
  const career = updateCareerRecord(null, match, "local");
  assert.equal(career.matches, 1);
  assert.equal(career.wins, 1);
  assert.equal(career.losses, 0);
  assert.equal(career.totalShots, 6);
  assert.equal(career.shots.dink, 4);
  assert.equal(career.winners, 2);
  assert.equal(career.recentMatches[0].result, "W");
});

test("ignores reports that do not contain the local player", () => {
  const career = { matches: 2, wins: 1 };
  assert.equal(updateCareerRecord(career, { players: [] }, "missing"), career);
});
