import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dependencyPath, makePlan } from '../dist/planner.js';
import { previewSemesterMove } from '../dist/plan-move.js';

const { courses } = JSON.parse(readFileSync(new URL('../dist/catalogue.json', import.meta.url)));
function scenario(targets, completed, settings = {}) {
  const done = new Set(completed);
  const path = dependencyPath(new Set(targets), done);
  const plan = makePlan(courses, path, done, settings);
  return { plan, move: (id, semester) => previewSemesterMove(courses, path, done, settings, plan, id, semester) };
}

test('moving a full-semester prerequisite preserves both periods and reschedules dependants without mutating the current plan', () => {
  const settings = { semesterChoices: {} };
  const { plan, move } = scenario(['1MA332'], ['1MA007'], settings);
  const before = structuredClone(plan);
  const result = move('1MA036', 3);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.offering.periods, [4,5]);
  const updated = scenario(['1MA332'], ['1MA007'], { semesterChoices: result.semesterChoices }).plan;
  assert.deepEqual(updated.scheduled.get('1MA332').periods, [11]);
  assert.deepEqual(plan, before);
  assert.deepEqual(settings.semesterChoices, {});
});

test('a move cannot displace a dependent course pinned to an earlier semester', () => {
  const { move } = scenario(['1MA332'], ['1MA007'], { semesterChoices: { '1MA332': 2 } });
  const result = move('1MA036', 3);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Semester 2 was selected/);
});

test('moves reject unavailable offerings, invalid destinations and absent courses', () => {
  const { move } = scenario(['1MA036'], ['1MA007']);
  assert.equal(move('1MA036', 2).allowed, false);
  for (const semester of [0, -1, 1.5, 99]) assert.equal(move('1MA036', semester).allowed, false);
  assert.equal(move('missing', 1).allowed, false);
});

test('project moves enforce period capacity and retain exceptional placement warnings', () => {
  const targets = ['1MA333','1MA325','1MA332','1MA080','1MA337','1MA216','1MA196','1MA038'];
  const completed = ['1MA007','1MA362'];
  const limited = scenario(targets, completed).move('1MA080', 3);
  assert.equal(limited.allowed, false);
  assert.match(limited.reason, /Analytic Number Theory/);
  const unlimited = scenario(targets, completed, { capacity: 'unlimited' }).move('1MA080', 3);
  assert.equal(unlimited.allowed, true);
  assert.deepEqual(unlimited.offering.periods, [4,5]);
  assert.equal(unlimited.offering.exceptionalProject, true);
});
