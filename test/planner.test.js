import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rules } from '../dist/rules.js';
import { dependencyPath, makePlan, offeringsFor, parseOffering, validateCatalogue } from '../dist/planner.js';

const { courses } = JSON.parse(readFileSync(new URL('../dist/catalogue.json', import.meta.url)));
const byId = new Map(courses.map(c => [c.id, c]));
const set = (...items) => new Set(items);

test('all 52 official courses have reviewed, acyclic rules and official sources', () => {
  assert.equal(validateCatalogue(courses).size, 52);
  assert.equal(Object.keys(rules).length, courses.length);
  for (const c of courses) {
    assert.match(c.source, /^https:\/\/www\.uu\.se\/en\/study\/course\?query=/);
    assert.ok(c.requirements.length, `${c.id} must retain official requirements`);
    for (const o of c.offerings) assert.ok(parseOffering(o.dates), `${c.id}: ${o.dates}`);
  }
});
test('detects corrupt catalogues, unknown IDs and cycles', () => {
  assert.throws(() => validateCatalogue([...courses, courses[0]]), /Duplicate/);
  assert.throws(() => validateCatalogue(courses, { ...rules, '1MA362': [{ kind: 'participation', options: [{ course: 'missing' }] }] }), /Unknown prerequisite/);
  assert.throws(() => validateCatalogue(courses, { ...rules, '1MA362': [{ kind: 'participation', options: [{ course: '1MA338' }] }] }), /Circular/);
  assert.throws(() => dependencyPath(set('missing')), /Unknown course/);
});
test('multiple targets include the transitive union with one copy of shared prerequisites', () => {
  const path = dependencyPath(set('1MA338', '1MA331'));
  assert.deepEqual(path.included, set('1MA362', '1MA215', '1MA216', '1MA338', '1MA331'));
  assert.equal(path.edges.filter(e => e.from === '1MA362').length, 3);
});
test('completed courses stop prerequisite expansion and are not rescheduled', () => {
  const path = dependencyPath(set('1MA338'), set('1MA216'));
  assert.deepEqual(path.included, set('1MA216', '1MA338'));
  const plan = makePlan(courses, path, set('1MA216'));
  assert.deepEqual([...plan.scheduled.keys()], ['1MA338']);
});
test('OR requirements choose one route, including a compound external alternative', () => {
  const path = dependencyPath(set('1MA255'), new Set(), { '1MA255:1': 1 });
  assert.ok(path.included.has('1MA215'));
  assert.ok(!path.included.has('1MS036'));
  const external = dependencyPath(set('1MS900'), new Set(), { '1MS900:0': 1 });
  assert.deepEqual(external.included, set('1MS900'));
  assert.match(external.external[0].label, /Both Inference Theory II AND Regression Analysis/);
  assert.throws(() => dependencyPath(set('1MS900'), new Set(), { '1MS900:0': 99 }), /Invalid prerequisite choice/);
});
test('an already completed alternative is preferred unless explicitly overridden', () => {
  const path = dependencyPath(set('1MA255'), set('1MA215'));
  assert.ok(path.included.has('1MA215'));
  assert.ok(!path.included.has('1MS036'));
});
test('explicit parallel requirements fit in the same autumn; prior participation does not', () => {
  const done = set('1MA362');
  const path = dependencyPath(set('1MA338'), done);
  const plan = makePlan(courses, path, done);
  assert.deepEqual(plan.scheduled.get('1MA215').periods, [0,1]);
  assert.deepEqual(plan.scheduled.get('1MA216').periods, [0,1]);
  assert.deepEqual(plan.scheduled.get('1MA338').periods, [2,3]);
  assert.deepEqual(plan.loads, [10,10,5,5,0,0,0,0]);
  const notDone = makePlan(courses, dependencyPath(set('1MA338')), new Set());
  assert.ok(!notDone.scheduled.has('1MA216'));
});
test('projections are opt-in and visibly unconfirmed; past offerings are excluded', () => {
  const path = dependencyPath(set('1MA338'));
  const plan = makePlan(courses, path, new Set(), { projections: true });
  assert.equal(plan.scheduled.get('1MA362').confirmed, true);
  assert.equal(plan.scheduled.get('1MA216').confirmed, false);
  assert.deepEqual(plan.scheduled.get('1MA338').periods, [6,7]);
  assert.equal(offeringsFor(byId.get('1MA338'), 2028).length, 0);
});
test('odd and even rotations use the calendar year of the teaching semester', () => {
  const lie = offeringsFor(byId.get('1MA333'), 2026, 4, true);
  assert.deepEqual(lie.map(o => o.periods), [[2],[10]]); // spring 2027 and 2029
  const analytic = offeringsFor(byId.get('1MA531'), 2026, 4, true);
  assert.deepEqual(analytic.map(o => o.periods), [[0,1],[8,9]]); // autumn 2026 and 2028
});
test('unknown teaching periods are not invented even when the semester is known', () => {
  assert.deepEqual(offeringsFor(byId.get('1MA336'), 2026, 4, true), []);
  const path = dependencyPath(set('1MA336'), set('1MA259', '1MA036'));
  const plan = makePlan(courses, path, set('1MA259', '1MA036'), { projections: true });
  assert.match(plan.unscheduled[0].reason, /No offering/);
});
test('published offering dates can add a period not shown in the outline', () => {
  assert.deepEqual(offeringsFor(byId.get('1RT700'), 2026).map(o => o.periods), [[1],[2]]);
  assert.deepEqual(offeringsFor(byId.get('2NE831'), 2026)[0].periods, [0]);
});
test('credit capacity is enforced in every occupied period without double counting a course', () => {
  const done = set('1MA362');
  const path = dependencyPath(set('1MA338'), done);
  const plan = makePlan(courses, path, done, { capacity: 7.5 });
  assert.ok(plan.loads.every(load => load <= 7.5));
  assert.ok(plan.unscheduled.some(c => c.id === '1MA216'));
  assert.equal(plan.scheduled.size, 1);
});
test('empty and fully completed target sets generate no study load', () => {
  for (const path of [dependencyPath(new Set()), dependencyPath(set('1MA338'), set('1MA338'))]) {
    const plan = makePlan(courses, path, set('1MA338'));
    assert.equal(plan.scheduled.size, 0);
    assert.ok(plan.loads.every(n => n === 0));
  }
});
