export const planningVersion = 2;

// v1 silently saved the old published-only default. Upgrade that default,
// retaining the student's targets, history and choices in app.js. Once the
// mode has a version, always preserve an explicit published-only selection.
export function includeFutureOfferings(saved) {
  return saved?.planningVersion >= planningVersion && typeof saved.projections === 'boolean'
    ? saved.projections : true;
}

export function restorePlanSettings(saved, courses, rules) {
  const valid = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const ids = new Set(courses.map(c=>c.id));
  const uniqueIds = (values,fallback=[]) => [...new Set((Array.isArray(values) ? values : fallback).filter(id=>typeof id==='string' && ids.has(id)))];
  const externalLabels = new Set(Object.values(rules).flatMap(groups=>groups.flatMap(g=>g.options.filter(o=>o.external).map(o=>o.external))));
  const choices = {};
  const semesterChoices = {};
  if (valid.semesterChoices && typeof valid.semesterChoices === 'object' && !Array.isArray(valid.semesterChoices)) {
    for (const [id, semester] of Object.entries(valid.semesterChoices)) {
      if (ids.has(id) && Number.isInteger(semester) && semester >= 1 && semester <= 16) semesterChoices[id] = semester;
    }
  }
  if (valid.choices && typeof valid.choices==='object' && !Array.isArray(valid.choices)) {
    for (const [key,value] of Object.entries(valid.choices)) {
      const match = key.match(/^([^:]+):(0|[1-9]\d*)$/);
      if (match && ids.has(match[1]) && Number.isInteger(value) && rules[match[1]]?.[Number(match[2])]?.options[value]) choices[key]=value;
    }
  }
  return {
    targets: uniqueIds(valid.targets), completed: uniqueIds(valid.completed), choices, semesterChoices,
    met: [...new Set((Array.isArray(valid.met) ? valid.met : []).filter(label=>externalLabels.has(label)))],
    startYear: [2026,2027,2028,2029,2030].includes(valid.startYear) ? valid.startYear : 2026,
    capacity: [7.5,10,15,20,'unlimited'].includes(valid.capacity) ? valid.capacity : 15,
    years: [2,3,4].includes(valid.years) ? valid.years : 2,
    projections: includeFutureOfferings(valid), planningVersion,
  };
}
