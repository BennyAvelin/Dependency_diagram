import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rules } from '../dist/rules.js';
import { dependencyPath, makePlan, offeringsFor, parseOffering, validateCatalogue } from '../dist/planner.js';
import { periodInfo, formatPeriods, periodsForDates } from '../dist/calendar.js';
import { includeFutureOfferings, planningVersion } from '../dist/settings.js';

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
  const notDone = makePlan(courses, dependencyPath(set('1MA338')), new Set(), { projections: false });
  assert.ok(!notDone.scheduled.has('1MA216'));
});
test('future planning is enabled by default and labelled provisional; published-only mode excludes past dates', () => {
  const path = dependencyPath(set('1MA338'));
  const plan = makePlan(courses, path, new Set());
  assert.equal(plan.scheduled.get('1MA362').confirmed, true);
  assert.equal(plan.scheduled.get('1MA216').confirmed, false);
  assert.deepEqual(plan.scheduled.get('1MA338').periods, [6,7]);
  assert.equal(offeringsFor(byId.get('1MA338'), 2028, 2, false).length, 0);
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
  assert.deepEqual(offeringsFor(byId.get('1RT700'), 2026, 2, false).map(o => o.periods), [[1],[2]]);
  assert.deepEqual(offeringsFor(byId.get('2NE831'), 2026, 2, false)[0].periods, [0,1]);
});
test('credit capacity is enforced in every occupied period without double counting a course', () => {
  const done = set('1MA362');
  const path = dependencyPath(set('1MA338'), done);
  const plan = makePlan(courses, path, done, { capacity: 7.5, projections: false });
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

test('Lie Algebras uses P4 of odd calendar years and explains the window overflow', () => {
  const path = dependencyPath(set('1MA332'));
  const plan = makePlan(courses,path,new Set());
  assert.deepEqual(plan.scheduled.get('1MA007').periods,[0,1]);
  assert.deepEqual(plan.scheduled.get('1MA036').periods,[4,5]);
  assert.equal(plan.scheduled.has('1MA332'),false); // Spring 2028 is not an offering.
  const overflow = plan.unscheduled.find(c=>c.id==='1MA332');
  assert.match(overflow.reason,/Spring 2029 · P4/);
  assert.equal(overflow.nextOffering.requiredYears,3);
  const extended = makePlan(courses,path,new Set(),{years:3});
  assert.deepEqual(extended.scheduled.get('1MA332').periods,[11]);
  assert.equal(extended.scheduled.get('1MA332').confirmed,false);
  assert.deepEqual(extended.unscheduled,[]);
});

test('Lie Algebras fits Spring 2027 P4 when Algebraic Structures is already met', () => {
  const completed = set('1MA007');
  const plan = makePlan(courses,dependencyPath(set('1MA332'),completed),completed);
  assert.deepEqual(plan.scheduled.get('1MA036').periods,[0,1]);
  assert.deepEqual(plan.scheduled.get('1MA332').periods,[3]);
  assert.equal(plan.scheduled.get('1MA332').confirmed,true);
  assert.equal(formatPeriods(2026,[3]),'Spring 2027 · P4');
  assert.equal(periodInfo(2026,3).semester,2);
});

test('all published course date ranges agree with the checked faculty calendar', () => {
  const expected = {
    '31 August 2026–1 November 2026': [0],
    '31 August 2026–17 January 2027': [0,1],
    '2 November 2026–17 January 2027': [1],
    '18 January 2027–21 March 2027': [2],
    '18 January 2027–6 June 2027': [2,3],
    '22 March 2027–6 June 2027': [3],
    // Economics ends two days into Science & Technology P2; no silent truncation.
    '31 August 2026–3 November 2026': [0,1],
  };
  for (const c of courses) {
    const mapped = offeringsFor(c,2026,2,false);
    assert.equal(mapped.length,c.offerings.length,`${c.id}: every published offering must map`);
    for (const o of mapped) {
      assert.deepEqual(o.periods,expected[o.dates],`${c.id}: ${o.dates}`);
      assert.ok(Math.abs(o.loads.reduce((a,b)=>a+b,0)-c.credits)<.001);
    }
  }
});

test('January boundaries are academic-year specific, including Spring 2028', () => {
  const c = { ...byId.get('1MA338'), offerings: [{dates:'17 January 2028–4 June 2028'}] };
  const o = offeringsFor(c,2026,2,false)[0];
  assert.deepEqual(o.periods,[6,7]); // Never P2 / autumn 2027.
  assert.deepEqual(o.loads,[5,5]);
  assert.equal(formatPeriods(2026,o.periods),'Spring 2028 · P3 + P4');
  assert.deepEqual(periodsForDates({start:'2027-01-18',end:'2027-01-31'}).map(p=>p.period),[3]);
  assert.deepEqual(periodInfo(2026,6).semesterDates,['2028-01-17','2028-06-04']);
  assert.equal(periodInfo(2026,6).start,null); // No invented 2027/28 faculty boundary.
});

test('exact half-semester boundaries map to the same labels as the timeline', () => {
  for (const [date,period] of [['2026-11-01',1],['2026-11-02',2],['2027-01-17',2],['2027-01-18',3],['2027-03-21',3],['2027-03-22',4]]) {
    const slots = periodsForDates({start:date,end:date});
    assert.equal(slots.length,1);
    assert.equal(slots[0].period,period);
    assert.equal(periodInfo(2026,period-1).period,period);
  }
  assert.deepEqual(periodsForDates({start:'2027-06-06',end:'2027-06-20'}),[]);
  assert.equal(parseOffering('31 February 2027–2 March 2027'),null);
  assert.equal(parseOffering('2 March 2027–1 March 2027'),null);
});

test('future planning preserves multiple offering patterns and fills courses without an outline grid', () => {
  const repeated = offeringsFor(byId.get('1RT700'),2026,2,true);
  assert.deepEqual(repeated.map(o=>o.periods),[[1],[2],[5],[6]]);
  assert.equal(repeated.at(-1).confirmed,false);
  const hpp = offeringsFor(byId.get('1TD062'),2027,2,true);
  assert.deepEqual(hpp[0].periods,[2]);
  assert.equal(hpp[0].source,'Previous published offering');
  assert.equal(offeringsFor(byId.get('1MA336'),2026,3,true).length,0);
});

test('existing saved plans migrate the broken default but preserve subsequent published-only choices', () => {
  assert.equal(includeFutureOfferings(),true);
  assert.equal(includeFutureOfferings({projections:false}),true);
  assert.equal(includeFutureOfferings({planningVersion,projections:false}),false);
  assert.equal(includeFutureOfferings({planningVersion,projections:true}),true);
});
