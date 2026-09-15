import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allowedProgrammeSemesters, programmePlacement, assessProgrammePlan } from '../dist/programme.js';

const { courses } = JSON.parse(readFileSync(new URL('../dist/catalogue.json', import.meta.url)));
const byId = new Map(courses.map(course => [course.id, course]));
const plan = entries => ({ scheduled: new Map(entries), unscheduled: [] });

test('outline semesters differ from recurring offering periods and respect explicit any-period courses', () => {
  assert.deepEqual(allowedProgrammeSemesters(byId.get('1MA332')), [2]);
  assert.deepEqual(allowedProgrammeSemesters(byId.get('1MA036')), [1, 3]);
  assert.deepEqual(allowedProgrammeSemesters(byId.get('1MA080')), [3, 4]);
  assert.deepEqual(allowedProgrammeSemesters(byId.get('1MA182')), [4]);
  assert.deepEqual(allowedProgrammeSemesters(byId.get('1MA344')), [1, 2, 3, 4]);
  assert.equal(programmePlacement(byId.get('1MA332'), { periods: [11] }).outsideProgramme, true);
  assert.equal(programmePlacement(byId.get('1MA332'), { periods: [7] }).supported, false);
  assert.equal(programmePlacement(byId.get('1MA332'), { periods: [3] }).supported, true);
  assert.equal(programmePlacement(byId.get('1MA182'), { periods: [4, 5] }).supported, false);
});

test('a valid offering in an unsupported programme semester is reported separately from availability', () => {
  const report = assessProgrammePlan(courses, plan([
    ['1MA080', { periods: [2, 3], loads: [15, 15], confirmed: true }],
  ]), { targets: new Set(['1MA080']) });
  assert.equal(report.programmeCredits, 30);
  assert.equal(report.outlineSupportedCredits, 0);
  assert.deepEqual(report.unsupportedPlacements.map(item => item.id), ['1MA080']);
  assert.equal(report.degreeProject.missing, true);
  assert.equal(report.creditGap, 90);
  assert.equal(report.outlineComplete, false);
});

test('an extended Lie route is a partial target path, not a complete four-semester degree plan', () => {
  const report = assessProgrammePlan(courses, plan([
    ['1MA007', { periods: [0, 1], loads: [5, 5] }],
    ['1MA036', { periods: [4, 5], loads: [5, 5] }],
    ['1MA332', { periods: [11], loads: [5] }],
  ]), { targets: new Set(['1MA332']) });
  assert.equal(report.totalScheduledCredits, 25);
  assert.equal(report.programmeCredits, 20);
  assert.equal(report.creditGap, 100);
  assert.equal(report.bridgingCredits, 10);
  assert.equal(report.basicCredits, 10);
  assert.deepEqual(report.semesters.map(semester => semester.gap), [20, 30, 20, 30]);
  assert.deepEqual(report.extendedCourseIds, ['1MA332']);
  assert.deepEqual(report.unscheduledTargetIds, []);
  assert.equal(report.partialPlan, true);
  assert.equal(report.degreeStatus, 'requires-review');
});

test('total 120 credits cannot hide an overloaded semester, unknown levels or missing final project', () => {
  const fixtures = [1, 2, 3, 4].map((semester, index) => ({
    id: `course-${semester}`, title: `Course ${semester}`, credits: [40, 20, 30, 30][index],
    outline: [{ semester, group: 'All tracks' }], subjectLevels: [],
  }));
  const report = assessProgrammePlan(fixtures, plan(fixtures.map((course, index) => [course.id, {
    periods: [index * 2, index * 2 + 1], loads: [course.credits / 2, course.credits / 2],
  }])));
  assert.equal(report.creditGap, 0);
  assert.equal(report.semesters[0].overload, 10);
  assert.equal(report.semesters[1].gap, 10);
  assert.equal(report.unknownLevelCredits, 120);
  assert.equal(report.advancedCredits, 0);
  assert.equal(report.degreeProject.missing, true);
  assert.equal(report.outlineComplete, false);
});

test('shared subject classifications do not double-count study credits or auto-credit completed markers', () => {
  const course = { id: 'both', title: 'Shared course', credits: 10, outline: [{ semester: 1, group: 'All tracks' }], subjectLevels: [
    { subject: 'Mathematics', level: 'A1N' }, { subject: 'Financial Mathematics', level: 'A1N' },
  ] };
  const placement = plan([['both', { periods: [0, 1], loads: [5, 5] }]]);
  const report = assessProgrammePlan([course], placement);
  assert.equal(report.advancedCredits, 10);
  assert.deepEqual(report.mainFieldAdvancedCredits, { Mathematics: 10, 'Financial Mathematics': 10 });
  assert.equal(assessProgrammePlan([course], placement, { completed: new Set(['both']) }).programmeCredits, 0);
  assert.deepEqual(assessProgrammePlan([course], plan([]), { completed: new Set(['both']), targets: new Set(['both']) }).unscheduledTargetIds, []);
});

test('even a complete outline workload remains subject to a degree review', () => {
  const fixtures = [1, 2, 3, 4].map(semester => ({
    id: semester === 4 ? '1MA080' : `course-${semester}`, title: `Course ${semester}`, credits: 30,
    outline: [{ semester, group: 'All tracks' }], subjectLevels: [{ subject: 'Mathematics', level: semester === 4 ? 'A2E' : 'A1N' }],
  }));
  const scheduled = plan(fixtures.map((course, index) => [course.id, { periods: [index * 2, index * 2 + 1], loads: [15, 15] }]));
  const report = assessProgrammePlan(fixtures, scheduled, { targets: new Set(['1MA080']) });
  assert.equal(report.outlineComplete, true);
  assert.equal(report.targetPathIncomplete, false);
  assert.equal(report.degreeStatus, 'requires-review');
  assert.equal(report.mainFieldAdvancedCredits.Mathematics, 120);
  scheduled.unscheduled.push({ id: 'missing-target' });
  assert.equal(assessProgrammePlan(fixtures, scheduled, { targets: new Set(['missing-target']) }).targetPathIncomplete, true);
});
