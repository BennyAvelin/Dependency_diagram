import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rules } from '../dist/rules.js';
import { restorePlanSettings, planningVersion } from '../dist/settings.js';
const {courses}=JSON.parse(readFileSync(new URL('../dist/catalogue.json',import.meta.url)));

test('saved targets, exact prerequisites, completed courses and explicit mode survive reload',()=>{
  const saved={targets:['1MA332','1MA080'],completed:['1MA007'],choices:{'1MA036:0':1},met:['Linear Algebra II'],startYear:2027,capacity:10,years:3,projections:false,planningVersion};
  assert.deepEqual(restorePlanSettings(saved,courses,rules),saved);
});
test('invalid saved fields are isolated without discarding valid choices',()=>{
  const parsed=restorePlanSettings({targets:['1MA332','missing','1MA332',null],completed:['1MA007','old'],choices:{'1MA036:0':1,'1MA036:0:extra':0,'1MA036:99':0,'missing:0':0,'1MA332:0':999},met:['Linear Algebra II','old generic equivalence'],startYear:'2026',capacity:-1,years:NaN},courses,rules);
  assert.deepEqual(parsed.targets,['1MA332']); assert.deepEqual(parsed.completed,['1MA007']);
  assert.deepEqual(parsed.choices,{'1MA036:0':1}); assert.deepEqual(parsed.met,['Linear Algebra II']);
  assert.equal(parsed.startYear,2026); assert.equal(parsed.capacity,15); assert.equal(parsed.years,2);
});
test('empty saved targets stay empty while malformed root data falls back safely',()=>{
  assert.deepEqual(restorePlanSettings({targets:[]},courses,rules).targets,[]);
  for(const value of [null,undefined,3,'bad',[],{}]) assert.deepEqual(restorePlanSettings(value,courses,rules).targets,['1MA338']);
});
