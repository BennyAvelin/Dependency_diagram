import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalogue } from '../dist/planner.js';

const { courses } = JSON.parse(readFileSync(new URL('../dist/catalogue.json', import.meta.url)));
const invalidCourse = (change, message) => {
  const snapshot = structuredClone(courses);
  change(snapshot[0]);
  assert.throws(() => validateCatalogue(snapshot), message);
};

test('catalogue validation preserves repeated tracks, distinct requirements and unknown offering periods', () => {
  const snapshot = structuredClone(courses);
  const integration = snapshot.find(c => c.id === '1MA215');
  integration.outline.push(structuredClone(integration.outline[0]));
  integration.requirements.push('A separate course-specific condition retained verbatim.');
  const unknown = snapshot.find(c => c.id === '1MA336');
  unknown.syllabus = null;
  assert.deepEqual(unknown.offerings, []);
  assert.ok(unknown.outline.every(o => o.periods.length === 0));
  const before = structuredClone(snapshot);
  const validated = validateCatalogue(snapshot);
  assert.equal(validated.size, courses.length);
  assert.equal(validated.get('1MA215'), integration);
  assert.deepEqual(snapshot, before, 'Validation must not merge tracks or rewrite official requirements');
});

test('malformed catalogue and course structures fail with actionable field errors', () => {
  for (const bad of [null, {}, 'courses', []]) assert.throws(() => validateCatalogue(bad), /non-empty courses array/);
  assert.throws(() => validateCatalogue([null]), /course ID/);
  for (const id of [null, 123, ' ']) invalidCourse(c => { c.id = id; }, /course ID/);
  for (const title of [null, {}, ' ']) invalidCourse(c => { c.title = title; }, /Invalid course/);
  for (const credits of [0, -5, NaN, Infinity, '5']) invalidCourse(c => { c.credits = credits; }, /Invalid course/);
  for (const requirements of [null, {}, 'Entry requirements', [], [null], [' ']]) {
    invalidCourse(c => { c.requirements = requirements; }, /Invalid requirements for 1MS369/);
  }
  for (const outline of [null, {}, [], 'outline']) invalidCourse(c => { c.outline = outline; }, /Invalid outline/);
  for (const entry of [null, {}, { ...courses[0].outline[0], semester: 5 }, { ...courses[0].outline[0], group: '' }, { ...courses[0].outline[0], note: null }]) {
    invalidCourse(c => { c.outline = [entry]; }, /Invalid outline entry/);
  }
  for (const offerings of [null, {}, 'offerings']) invalidCourse(c => { c.offerings = offerings; }, /Invalid offerings/);
});

test('outline period grids must be ordered, unique and conserve the course credits', () => {
  for (const periods of [null, {}, [null], [{ period: 0, credits: 5 }], [{ period: 5, credits: 5 }],
    [{ period: 1.5, credits: 5 }], [{ period: '1', credits: 5 }], [{ period: 1, credits: 0 }],
    [{ period: 1, credits: -5 }], [{ period: 1, credits: '5' }], [{ period: 1, credits: Infinity }],
    [{ period: 1, credits: 2.5 }, { period: 1, credits: 2.5 }],
    [{ period: 2, credits: 2.5 }, { period: 1, credits: 2.5 }]]) {
    invalidCourse(c => { c.outline[0].periods = periods; }, /Invalid outline (entry|periods)/);
  }
  invalidCourse(c => { c.outline[0].periods[0].credits = 4; }, /Invalid outline credit total/);
});

test('optional subject-level metadata retains unknown and multiple official classifications', () => {
  const snapshot = structuredClone(courses);
  snapshot[0].subjectLevels = [];
  snapshot[1].subjectLevels = [{ subject: 'Mathematics', level: 'A1N' }, { subject: 'Financial Mathematics', level: 'G2F' }];
  assert.doesNotThrow(() => validateCatalogue(snapshot));
  for (const subjectLevels of [null, {}, [null], [{ subject: '', level: 'A1N' }],
    [{ subject: 'Mathematics', level: null }], [{ subject: 'Mathematics', level: 'graduate' }]]) {
    invalidCourse(c => { c.subjectLevels = subjectLevels; }, /Invalid subject levels/);
  }
});

test('offering date ranges reject malformed or impossible dates without requiring a published period calendar', () => {
  for (const dates of [null, {}, '', 'next spring', '31 February 2027–2 March 2027', '7 June 2027–6 June 2027', '1 Smarch 2027–2 March 2027']) {
    invalidCourse(c => { c.offerings = [{ dates }]; }, /Invalid offering dates/);
  }
  invalidCourse(c => { c.offerings = [null]; }, /Invalid offering dates/);
  invalidCourse(c => { c.offerings[0].location = {}; }, /Invalid offering location/);
  const snapshot = structuredClone(courses);
  snapshot[0].offerings = [{ dates: '1 February 2030–28 February 2030' }];
  assert.doesNotThrow(() => validateCatalogue(snapshot), 'Valid dates with unknown period boundaries remain valid catalogue evidence');
});

test('course and optional syllabus links must be valid official HTTPS URLs', () => {
  for (const source of [null, {}, '', 'not a URL', '/en/study/course?query=1MS369', 'javascript:alert(1)',
    'http://www.uu.se/en/study/course?query=1MS369', 'https://example.org/en/study/course?query=1MS369',
    'https://user:password@www.uu.se/en/study/course?query=1MS369',
    'https://www.uu.se/en/study/course', 'https://www.uu.se/en/study/course?query=1MA332']) {
    invalidCourse(c => { c.source = source; }, /Invalid course source URL/);
  }
  for (const syllabus of ['', '/syllabus', 'https://www.uu.se/en/study/syllabus', 'https://example.org/en/study/syllabus?query=123']) {
    invalidCourse(c => { c.syllabus = syllabus; }, /Invalid syllabus URL/);
  }
});

test('malformed reviewed rule groups fail clearly instead of crashing during traversal', () => {
  const c = structuredClone(courses[0]);
  for (const group of [null, {}, { kind: 'completed', options: null }, { kind: 'completed', options: [] }]) {
    assert.throws(() => validateCatalogue([c], { [c.id]: [group] }), /Invalid requirement for 1MS369/);
  }
  for (const option of [null, {}, { external: ' ' }, { course: '1MS369', external: 'Other course' }]) {
    assert.throws(() => validateCatalogue([c], { [c.id]: [{ kind: 'completed', options: [option] }] }), /Invalid prerequisite option for 1MS369/);
  }
});
