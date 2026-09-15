import test from 'node:test';
import assert from 'node:assert/strict';
import { rules } from '../dist/rules.js';
import { dependencyPath } from '../dist/planner.js';

test('a limited calculus alternative does not also mark full calculus requirements met', () => {
  const path = dependencyPath(new Set(['1MA209', '1TD354', '1MS041']), new Set(), { '1MA209:0': 1 });
  const met = new Set(['Several Variable Calculus, Limited Version']);
  const calculus = path.external.filter(item => item.label.includes('Calculus'));
  assert.deepEqual(calculus.map(item => [item.course, item.kind, met.has(item.label)]), [
    ['1MA209', 'completed', true],
    ['1TD354', 'completed', false],
    ['1MS041', 'parallel', true],
  ]);
  assert.ok(path.external.some(item => item.course === '1MA209' && item.label === 'Probability and Statistics'));
  assert.ok(path.external.some(item => item.course === '1TD354' && item.label === 'Linear Algebra II'));
});

test('course-specific calculus alternatives retain their official scope and prerequisite kind', () => {
  const expected = [
    ['1MA148', 1, 'participation', ['Several Variable Calculus', 'Several Variable Calculus M']],
    ['1TD354', 1, 'completed', ['Several Variable Calculus']],
    ['1MA209', 0, 'completed', ['Several Variable Calculus', 'Several Variable Calculus, Limited Version', 'Several Variable Calculus M', 'Geometry and Analysis II']],
    ['1MA362', 1, 'participation', ['Several Variable Calculus', 'Calculus in Several Variables', 'Several Variable Calculus M']],
    ['1MS036', 1, 'participation', ['Several Variable Calculus', 'Several Variable Calculus M', 'Several Variable Calculus, Limited Version']],
    ['1MA053', 0, 'completed', ['Several Variable Calculus', 'Several Variable Calculus M', 'Geometry and Analysis III']],
  ];
  for (const [id, group, kind, labels] of expected) {
    assert.equal(rules[id][group].kind, kind, id);
    assert.deepEqual(rules[id][group].options.map(option => option.external), labels, id);
    for (const [index, label] of labels.entries()) {
      const path = dependencyPath(new Set([id]), new Set(), { [`${id}:${group}`]: index });
      assert.deepEqual(path.external.filter(item => item.key === `${id}:${group}`).map(item => item.label), [label]);
    }
  }
});
