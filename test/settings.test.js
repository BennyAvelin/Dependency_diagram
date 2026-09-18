import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rules } from '../dist/rules.js';
import { restorePlanSettings, planningVersion } from '../dist/settings.js';
const {courses}=JSON.parse(readFileSync(new URL('../dist/catalogue.json',import.meta.url)));

test('saved targets, exact prerequisites, completed courses and explicit mode survive reload',()=>{
  const saved={targets:['1MA332','1MA080'],completed:['1MA007'],choices:{'1MA036:0':1},semesterChoices:{'1MA080':3,'1MA036':1},met:['Linear Algebra II'],startYear:2027,capacity:10,years:3,projections:false,planningVersion};
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
  for(const value of [null,undefined,3,'bad',[],{}, {targets:'bad',completed:'bad'}]) {
    const restored = restorePlanSettings(value,courses,rules);
    assert.deepEqual(restored.targets,[]);
    assert.deepEqual(restored.completed,[]);
  }
});

test('semester choices survive mode changes and reject corrupt stored values',()=>{
  const parsed=restorePlanSettings({semesterChoices:{'1MA080':3,'1MA036':16,'missing':2,'1MA332':'2','1MA333':0,'1MA325':17},projections:false,planningVersion},courses,rules);
  assert.deepEqual(parsed.semesterChoices,{'1MA080':3,'1MA036':16});
  assert.equal(parsed.projections,false);
  assert.deepEqual(restorePlanSettings({},courses,rules).semesterChoices,{});
});

test('unlimited capacity survives JSON persistence and corrupt unlimited representations do not',()=>{
  const saved=restorePlanSettings({capacity:'unlimited'},courses,rules);
  assert.equal(restorePlanSettings(JSON.parse(JSON.stringify(saved)),courses,rules).capacity,'unlimited');
  for(const capacity of [null,Infinity,'Infinity','Unlimited']) assert.equal(restorePlanSettings({capacity},courses,rules).capacity,15);
});
