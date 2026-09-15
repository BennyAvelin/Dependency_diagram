import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rules } from '../dist/rules.js';
import { dependencyPath, makePlan, offeringsFor, parseOffering, validateCatalogue, semesterOptions } from '../dist/planner.js';
import { periodInfo, formatPeriods, formatOffering, periodsForDates } from '../dist/calendar.js';
import { studyPlanView } from '../dist/plan-view.js';
import { includeFutureOfferings, planningVersion } from '../dist/settings.js';
import { assessProgrammePlan } from '../dist/programme.js';

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
  assert.deepEqual(offeringsFor(byId.get('1MA344'), 2026, 4, true), []);
  const path = dependencyPath(set('1MA344'), set('1MA259', '1MA036'));
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

test('Lie Algebras automatically extends the default plan to P4 of an odd calendar year', () => {
  const path = dependencyPath(set('1MA332'));
  const plan = makePlan(courses,path,new Set());
  assert.deepEqual(plan.scheduled.get('1MA007').periods,[0,1]);
  assert.deepEqual(plan.scheduled.get('1MA036').periods,[4,5]);
  assert.deepEqual(plan.scheduled.get('1MA332').periods,[11]); // Spring 2029, never spring 2028.
  assert.equal(plan.scheduled.get('1MA332').confirmed,false);
  assert.equal(plan.requestedYears,2);
  assert.equal(plan.years,3);
  assert.equal(plan.loads.length,12);
  assert.deepEqual(plan.unscheduled,[]);
  const view = studyPlanView(plan,set('1MA332'),new Set(),2026);
  assert.equal(view.extended,true);
  assert.equal(view.semesters.length,6);
  assert.equal(view.semesters[5].year,2029);
  assert.equal(view.semesters[5].term,'Spring');
  assert.equal(view.semesters[5].beyondProgramme,true);
  assert.equal(view.targets[0].status,'scheduled');
  assert.match(view.targets[0].label,/Spring 2029 · P4 · Provisional offering/);
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
  assert.equal(offeringsFor(byId.get('1MA344'),2026,3,true).length,0);
});

test('existing saved plans migrate the broken default but preserve subsequent published-only choices', () => {
  assert.equal(includeFutureOfferings(),true);
  assert.equal(includeFutureOfferings({projections:false}),true);
  assert.equal(includeFutureOfferings({planningVersion,projections:false}),false);
  assert.equal(includeFutureOfferings({planningVersion,projections:true}),true);
});

test('full-semester degree projects fit a full-time period load without losing credits', () => {
  for (const id of ['1MA080','1MA182']) {
    const offering = offeringsFor(byId.get(id),2026,2,false)[0];
    assert.deepEqual(offering.periods,[2,3]);
    assert.deepEqual(offering.loads,[15,15]);
    assert.match(offering.loadBasis,/Estimated equal credit split/);
  }
  assert.deepEqual(offeringsFor(byId.get('2NE831'),2026,2,false)[0].loads,[7.27,.23]);
});

test('every target has a visible outcome when completed, unknown, or restricted to published offerings', () => {
  for (const [id,done,options,status] of [
    ['1MA332',set('1MA332'),{},'completed'],
    ['1MA344',set('1MA259','1MA036'),{},'unscheduled'],
    ['1MA332',new Set(),{projections:false},'unscheduled'],
    ['1MA332',new Set(),{capacity:7.5},'scheduled'],
    ['1MA332',new Set(),{capacity:1},'unscheduled'],
  ]) {
    const plan = makePlan(courses,dependencyPath(set(id),done),done,options);
    const view = studyPlanView(plan,set(id),done,2026);
    assert.equal(view.targets.length,1);
    assert.equal(view.targets[0].id,id);
    assert.equal(view.targets[0].status,status);
    if (status !== 'scheduled') assert.equal(plan.years,2,'Unknown or impossible targets do not fill eight empty years');
  }
});

test('automatic extension preserves the chosen minimum and contracts when prerequisites are met', () => {
  const settings = { years:2, startYear:2026, projections:true };
  const extended = makePlan(courses,dependencyPath(set('1MA332')),new Set(),settings);
  assert.equal(extended.years,3);
  assert.equal(settings.years,2);
  const done = set('1MA007');
  const shorter = makePlan(courses,dependencyPath(set('1MA332'),done),done,settings);
  assert.equal(shorter.years,2);
  assert.equal(studyPlanView(shorter,set('1MA332'),done,2026).extended,false);
  assert.match(studyPlanView(shorter,set('1MA332'),done,2026).targets[0].label,/Spring 2027 · P4 · Published offering/);
});

test('all course targets and their union retain valid periods, loads, dependency order and visible target outcomes', () => {
  const selections = courses.map(c=>set(c.id));
  selections.push(new Set(courses.map(c=>c.id)));
  for (const targets of selections) for (const startYear of [2026,2027]) for (const capacity of [7.5,15]) for (const projections of [false,true]) {
    const done = new Set();
    const path = dependencyPath(targets,done);
    const plan = makePlan(courses,path,done,{startYear,capacity,projections});
    const view = studyPlanView(plan,targets,done,startYear);
    assert.equal(plan.scheduled.size + plan.unscheduled.length,path.included.size);
    assert.equal(view.targets.length,targets.size);
    assert.ok(plan.years>=2 && plan.years<=8);
    assert.equal(plan.loads.length,view.semesters.length*2);
    assert.ok(plan.loads.every(load=>Number.isFinite(load) && load<=capacity+.001));
    for (const [id,offering] of plan.scheduled) {
      assert.ok(offering.periods.every(p=>p>=0 && p<view.semesters.length*2),`${id}: placement must be rendered`);
      assert.ok(offeringsFor(byId.get(id),startYear,plan.years,projections).some(o=>o.periods.join()===offering.periods.join() && o.confirmed===offering.confirmed));
      assert.ok(Math.abs(offering.loads.reduce((n,v)=>n+v,0)-byId.get(id).credits)<.001);
      for (const edge of path.edges.filter(e=>e.to===id)) {
        const prerequisite = plan.scheduled.get(edge.from);
        assert.ok(prerequisite,`${id}: prerequisite ${edge.from} must be placed`);
        assert.ok(edge.kind==='parallel' ? prerequisite.periods[0]<=offering.periods[0] : prerequisite.periods.at(-1)<offering.periods[0]);
      }
    }
    for (const target of view.targets) assert.equal(target.status,plan.scheduled.has(target.id)?'scheduled':'unscheduled');
  }
});

test('mathematics degree project supports programme semesters 3 and 4 and retains provisional status', () => {
  for (const startYear of [2026,2027,2028,2029,2030]) {
    const options = offeringsFor(byId.get('1MA080'),startYear,2,true);
    assert.deepEqual(options.filter(o=>!o.confirmed).map(o=>o.periods),[[4,5],[6,7]]);
    assert.ok(options.filter(o=>!o.confirmed).every(o=>o.loads.join()==='15,15' && /Programme outline/.test(o.source)));
    const plan = makePlan(courses,dependencyPath(set('1MA080')),new Set(),{startYear});
    assert.deepEqual(plan.scheduled.get('1MA080').periods,[6,7]);
    assert.equal(plan.scheduled.get('1MA080').confirmed,false);
    assert.match(studyPlanView(plan,set('1MA080'),new Set(),startYear).targets[0].label,new RegExp(`Spring ${startYear+2} · P3 \\+ P4 · Provisional`));
    const financial = makePlan(courses,dependencyPath(set('1MA182')),new Set(),{startYear});
    assert.deepEqual(financial.scheduled.get('1MA182').periods,[6,7]);
    assert.ok(offeringsFor(byId.get('1MA182'),startYear,2,true).every(o=>o.periods[0]%4===2));
  }
  const publishedOnly = makePlan(courses,dependencyPath(set('1MA080')),new Set(),{projections:false});
  assert.equal(publishedOnly.scheduled.size,0);
  assert.match(publishedOnly.unscheduled[0].reason,/semester-4/);
  assert.equal(publishedOnly.years,2);
  assert.equal(offeringsFor(byId.get('1MA344'),2026,8,true).length,0,'Other semester-only courses retain unknown periods');
});

test('the user’s five targets fit two years with the mathematics degree project defaulting to semester 4', () => {
  const targets = set('1MA333','1MA325','1MA332','1MA080','1MA337');
  const completed = set('1MA007','1MA362');
  const plan = makePlan(courses,dependencyPath(targets,completed),completed);
  assert.equal(plan.years,2);
  assert.deepEqual(plan.unscheduled,[]);
  assert.deepEqual(plan.scheduled.get('1MA080').periods,[6,7]);
  assert.deepEqual(plan.scheduled.get('1MA333').periods,[2]);
  assert.deepEqual(plan.scheduled.get('1MA332').periods,[3]);
  assert.deepEqual(plan.scheduled.get('1MA325').periods,[2,3]);
  assert.deepEqual(plan.scheduled.get('1MA337').periods,[2]);
  assert.deepEqual(plan.loads,[10,10,15,10,0,0,15,15]);
  const view = studyPlanView(plan,targets,completed,2026);
  assert.equal(view.extended,false);
  assert.equal(view.targets.filter(t=>t.status==='scheduled').length,5);
  assert.ok(view.semesters.every(s=>!s.beyondProgramme));
});

test('ordinary course placements prefer the listed programme semester over an earlier published offering', () => {
  const plan = makePlan(courses,dependencyPath(set('1TD186')),new Set());
  const offering = plan.scheduled.get('1TD186');
  assert.equal(Math.floor(offering.periods[0]/2)+1,3);
  assert.equal(offering.outsideOutline,false);
  const withProject = makePlan(courses,dependencyPath(set('1TD186','1MA080')),new Set());
  assert.equal(withProject.years,2);
  assert.deepEqual(withProject.scheduled.get('1MA080').periods,[6,7]);
  assert.equal(withProject.scheduled.get('1MA080').outsideOutline,false);
});

test('an exploratory placement stays visible but never claims to fit the programme outline', () => {
  const targets = set('1MA332');
  const plan = makePlan(courses,dependencyPath(targets),new Set());
  const offering = plan.scheduled.get('1MA332');
  assert.deepEqual(offering.periods,[11]);
  assert.equal(offering.outsideOutline,true);
  assert.deepEqual(offering.outlineSemesters,[2]);
  assert.match(studyPlanView(plan,targets,new Set(),2026).targets[0].label,/Outside programme outline; review required/);
});

test('semester 3 project is available only by explicit exception and automatic restores semester 4', () => {
  const targets = set('1MA080'), path = dependencyPath(targets);
  const exceptional = makePlan(courses,path,new Set(),{semesterChoices:{'1MA080':3}});
  assert.deepEqual(exceptional.scheduled.get('1MA080').periods,[4,5]);
  assert.equal(exceptional.scheduled.get('1MA080').exceptionalProject,true);
  assert.match(studyPlanView(exceptional,targets,new Set(),2026).targets[0].label,/Semester 3 exception/);
  assert.deepEqual(makePlan(courses,path,new Set()).scheduled.get('1MA080').periods,[6,7]);
  const overloaded = makePlan(courses,path,new Set(),{capacity:10,semesterChoices:{'1MA080':3}});
  assert.equal(overloaded.scheduled.size,0);
  assert.match(overloaded.unscheduled[0].reason,/Semester 3 was selected/);
  const financial = makePlan(courses,dependencyPath(set('1MA182')),new Set(),{semesterChoices:{'1MA182':3}});
  assert.equal(financial.scheduled.size,0);
});

test('semester choice moves a course and its dependants while preserving offering rotations', () => {
  const targets=set('1MA332'), done=set('1MA007');
  const plan=makePlan(courses,dependencyPath(targets,done),done,{semesterChoices:{'1MA036':3}});
  assert.deepEqual(plan.scheduled.get('1MA036').periods,[4,5]);
  assert.deepEqual(plan.scheduled.get('1MA332').periods,[11]);
  assert.equal(plan.years,3);
  assert.equal(plan.scheduled.get('1MA036').chosenSemester,3);
  const conflict=makePlan(courses,dependencyPath(targets,done),done,{semesterChoices:{'1MA036':3,'1MA332':2}});
  assert.equal(conflict.scheduled.has('1MA332'),false);
  assert.match(conflict.unscheduled.find(c=>c.id==='1MA332').reason,/Semester 2 was selected/);
});

test('semester options use actual offering mode, outline labels and exceptional project stages', () => {
  assert.deepEqual(semesterOptions(byId.get('1MA080'),2026,2,true).map(o=>[o.semester,o.exceptional]),[[3,true],[4,false]]);
  assert.deepEqual(semesterOptions(byId.get('1MA080'),2026,2,false),[]);
  assert.deepEqual(semesterOptions(byId.get('1MA344'),2026,8,true),[]);
  const done=set('1MA007'), targets=set('1MA036');
  const unavailable=makePlan(courses,dependencyPath(targets,done),done,{projections:false,semesterChoices:{'1MA036':3}});
  assert.equal(unavailable.scheduled.size,0);
  assert.match(unavailable.unscheduled[0].reason,/Semester 3 was selected/);
  for (const semesterChoices of [null,[],{'missing':2},{'1MA080':0},{'1MA080':17}]) assert.throws(()=>makePlan(courses,dependencyPath(targets,done),done,{semesterChoices}),/Invalid course semester choices/);
});

test('autumn odd-year outline notes place Analytic Number Theory and Dynamical Systems in semester 3', () => {
  for (const id of ['1MA038','1MA217']) {
    const targets=set(id), plan=makePlan(courses,dependencyPath(targets),new Set());
    const offering=plan.scheduled.get(id);
    assert.deepEqual(offering.periods,[4,5]);
    assert.deepEqual(offering.loads,[5,5]);
    assert.equal(offering.semesterOnly,true);
    assert.equal(offering.confirmed,false);
    assert.equal(offering.outsideOutline,false);
    assert.equal(plan.years,2);
    assert.match(offering.loadBasis,/estimated equally/);
    assert.equal(formatOffering(2026,offering),'Autumn 2027 · Periods not yet planned');
    assert.match(studyPlanView(plan,targets,new Set(),2026).targets[0].label,/Schedule not yet published/);
    assert.doesNotMatch(studyPlanView(plan,targets,new Set(),2026).targets[0].label,/P1|P2/);
    assert.deepEqual(offeringsFor(byId.get(id),2026,2,false),[]);
    assert.equal(semesterOptions(byId.get(id),2026,2,true)[0].semesterOnly,true);
  }
});

test('spring even-year notes preserve rotations, dependencies and chosen-semester constraints', () => {
  for(const id of ['1MA336','1MA056']) {
    const offerings=offeringsFor(byId.get(id),2026,4,true);
    assert.deepEqual(offerings.map(o=>o.periods),[[6,7],[14,15]]);
    assert.ok(offerings.every(o=>o.semesterOnly && !o.confirmed));
    assert.equal(formatOffering(2026,offerings[0]),'Spring 2028 · Periods not yet planned');
  }
  const targets=set('1MA038'), path=dependencyPath(targets);
  const invalid=makePlan(courses,path,new Set(),{semesterChoices:{'1MA038':1}});
  assert.equal(invalid.scheduled.has('1MA038'),false);
  assert.match(invalid.unscheduled.find(c=>c.id==='1MA038').reason,/Semester 1 was selected/);
  const valid=makePlan(courses,path,new Set(),{semesterChoices:{'1MA038':3}});
  assert.equal(valid.scheduled.get('1MA038').chosenSemester,3);
  assert.ok(valid.scheduled.get('1MA362').periods.at(-1)<valid.scheduled.get('1MA038').periods[0]);
});

test('published period patterns take precedence over semester-only assumptions', () => {
  const course={...byId.get('1MA038'),offerings:[{dates:'31 August 2026–17 January 2027',pace:'33%',location:'Uppsala'}]};
  const offerings=offeringsFor(course,2026,2,true);
  assert.equal(offerings[0].confirmed,true);
  assert.ok(offerings.every(o=>!o.semesterOnly));
  assert.match(formatOffering(2026,offerings[0]),/P1 \+ P2/);
  const noNote={...byId.get('1MA038'),outline:byId.get('1MA038').outline.map(o=>({...o,note:''}))};
  assert.deepEqual(offeringsFor(noNote,2026,2,true),[]);
});

test('the current semester-3 project conflict names the workload and occupying courses', () => {
  const targets=set('1MA333','1MA325','1MA332','1MA080','1MA337','1MA216','1MA196','1MA038');
  const done=set('1MA007','1MA362'), path=dependencyPath(targets,done);
  const plan=makePlan(courses,path,done,{semesterChoices:{'1MA080':3}});
  const failure=plan.unscheduled.find(c=>c.id==='1MA080');
  assert.equal(failure.blockerType,'capacity');
  assert.deepEqual(failure.conflicts.map(c=>[c.period,c.existing,c.required,c.total,c.limit]),[[4,15,15,30,15],[5,15,15,30,15]]);
  assert.deepEqual(new Set(failure.conflicts.flatMap(c=>c.courseIds)),set('1MA038','1MA259','1MA216'));
  assert.match(failure.reason,/Analytic Number Theory/);
  assert.match(failure.reason,/Differential Topology/);
  assert.match(failure.reason,/Partial Differential Equations/);
  assert.doesNotMatch(failure.reason,/prerequisite/);
  const fourth=makePlan(courses,path,done,{semesterChoices:{'1MA080':4}});
  assert.deepEqual(fourth.scheduled.get('1MA080').periods,[6,7]);
});

test('chosen semester errors distinguish offerings, prerequisite timing and capacity', () => {
  const done=set('1MA007'), targets=set('1MA332');
  const prerequisite=makePlan(courses,dependencyPath(targets,done),done,{semesterChoices:{'1MA036':3,'1MA332':2}}).unscheduled.find(c=>c.id==='1MA332');
  assert.equal(prerequisite.blockerType,'prerequisite');
  assert.match(prerequisite.reason,/Modules and Homological Algebra.*must finish before/);
  const offering=makePlan(courses,dependencyPath(set('1MA080')),new Set(),{projections:false,semesterChoices:{'1MA080':3}}).unscheduled[0];
  assert.equal(offering.blockerType,'offering');
  assert.match(offering.reason,/Enable projected future offerings/);
  const capacity=makePlan(courses,dependencyPath(set('1MA080')),new Set(),{capacity:10,semesterChoices:{'1MA080':3}}).unscheduled[0];
  assert.equal(capacity.blockerType,'capacity');
  assert.deepEqual(capacity.conflicts[0].courseIds,[]);
  assert.match(capacity.reason,/0 already planned \+ 15 for this course = 15 credits \(limit 10\)/);
});

test('unlimited capacity permits the semester-3 project while retaining workload and programme checks', () => {
  const targets=set('1MA333','1MA325','1MA332','1MA080','1MA337','1MA216','1MA196','1MA038');
  const done=set('1MA007','1MA362'), path=dependencyPath(targets,done);
  const settings={capacity:'unlimited',semesterChoices:{'1MA080':3}};
  const plan=makePlan(courses,path,done,settings);
  assert.deepEqual(plan.scheduled.get('1MA080').periods,[4,5]);
  assert.equal(plan.unscheduled.length,0);
  assert.ok(plan.loads.every(Number.isFinite));
  assert.ok(plan.loads.some(load=>load>15));
  const report=assessProgrammePlan(courses,plan,{completed:done,targets});
  assert.ok(report.semesters.some(s=>s.overload>0));
  assert.equal(report.outlineComplete,false);
  assert.equal(report.degreeStatus,'requires-review');
  const bounded=makePlan(courses,path,done,{...settings,capacity:15});
  assert.equal(bounded.scheduled.has('1MA080'),false);
  const restricted=makePlan(courses,path,done,{...settings,projections:false});
  assert.equal(restricted.scheduled.has('1MA080'),false);
  const conflict=makePlan(courses,path,done,{capacity:'unlimited',semesterChoices:{'1MA036':3,'1MA332':2}});
  assert.equal(conflict.unscheduled.find(c=>c.id==='1MA332').blockerType,'prerequisite');
});
