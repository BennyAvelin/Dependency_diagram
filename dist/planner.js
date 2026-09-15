import { rules } from './rules.js';
import { periodsForDates, formatPeriods } from './calendar.js';

export function validateCatalogue(courses, ruleSet = rules) {
  const byId = new Map();
  for (const c of courses) {
    if (!c.id || byId.has(c.id)) throw new Error(`Duplicate or missing course ID: ${c.id}`);
    if (!c.title || !Number.isFinite(c.credits) || c.credits <= 0) throw new Error(`Invalid course: ${c.id}`);
    byId.set(c.id, c);
  }
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Circular dependency involving ${id}`);
    if (visited.has(id)) return;
    if (!byId.has(id)) throw new Error(`Unknown prerequisite: ${id}`);
    if (!Array.isArray(ruleSet[id])) throw new Error(`Unreviewed dependency rules for ${id}`);
    visiting.add(id);
    for (const g of ruleSet[id]) {
      if (!['completed', 'participation', 'parallel'].includes(g.kind) || !g.options.length) throw new Error(`Invalid requirement for ${id}`);
      for (const o of g.options) {
        if (Boolean(o.course) === Boolean(o.external)) throw new Error(`Invalid prerequisite option for ${id}`);
        if (o.course) visit(o.course);
      }
    }
    visiting.delete(id); visited.add(id);
  }
  courses.forEach(c => visit(c.id));
  return byId;
}

export function dependencyPath(targets, completed = new Set(), choices = {}, ruleSet = rules) {
  const included = new Set(), edges = [], external = [], levels = new Map(), visiting = new Set();
  function visit(id) {
    if (!(id in ruleSet)) throw new Error(`Unknown course: ${id}`);
    if (visiting.has(id)) throw new Error(`Circular dependency involving ${id}`);
    if (included.has(id)) return levels.get(id);
    visiting.add(id);
    let depth = 0;
    if (!completed.has(id)) (ruleSet[id] ?? []).forEach((g, i) => {
      const key = `${id}:${i}`;
      const chosen = choices[key] ?? Math.max(0, g.options.findIndex(o => o.course && completed.has(o.course)));
      if (!Number.isInteger(chosen) || !g.options[chosen]) throw new Error(`Invalid prerequisite choice: ${key}`);
      const option = g.options[chosen];
      if (option.course) {
        depth = Math.max(depth, visit(option.course) + 1);
        edges.push({ from: option.course, to: id, kind: g.kind, alternative: g.options.length > 1 });
      } else external.push({ course: id, key, label: option.external, kind: g.kind });
    });
    visiting.delete(id); included.add(id); levels.set(id, depth);
    return depth;
  }
  targets.forEach(visit);
  return { included, edges, external, levels };
}

const months = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
export function parseOffering(dates) {
  const m = dates.replace(/\s+/g,' ').trim().match(/^(\d+) (\w+) (\d{4})\s*[–-]\s*(\d+) (\w+) (\d{4})$/);
  if (!m || !months[m[2]] || !months[m[5]]) return null;
  const start = `${m[3]}-${String(months[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const end = `${m[6]}-${String(months[m[5]]).padStart(2, '0')}-${m[4].padStart(2, '0')}`;
  if (start > end || [start,end].some(d => !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d)) return null;
  return { start, end };
}

function publishedOfferings(course) {
  const results = [];
  for (const raw of course.offerings ?? []) {
    const dates = parseOffering(raw.dates);
    if (!dates) continue;
    const slots = periodsForDates(dates);
    if (!slots.length) continue;
    const periods = slots.map(p => p.period);
    const outline = course.outline.find(o => o.periods?.map(p => p.period).join() === periods.join());
    const matchesOutline = outline && Math.abs(outline.periods.reduce((n,p) => n+p.credits,0)-course.credits)<.01;
    const days = slots.reduce((n,p) => n+(p.days ?? 0),0);
    const loads = matchesOutline ? outline.periods.map(p=>p.credits)
      : slots.map(p => Number((course.credits * (days ? p.days/days : 1/slots.length)).toFixed(2)));
    loads[loads.length-1] = Number((course.credits-loads.slice(0,-1).reduce((n,p)=>n+p,0)).toFixed(2));
    results.push({ slots, loads, confirmed: true, dates: raw.dates, source: course.source,
      loadBasis: matchesOutline ? 'Outline credit split' : 'Estimated workload from the published date range' });
  }
  return results;
}

export function offeringsFor(course, startYear, years = 2, projections = true) {
  const results = [];
  const published = publishedOfferings(course);
  for (const offering of published) {
    const { slots, ...details } = offering;
    const periods = slots.map(p=>(p.academicYear-startYear)*4+p.period-1);
    if (periods[0]<0 || periods.at(-1)>=years*4) continue;
    results.push({ ...details, periods });
  }
  if (projections) {
    const notes = course.outline.map(o => o.note).join(' ');
    const patterns = new Map();
    const addPattern = (periods,loads,basis) => {
      if (periods.length && !patterns.has(periods.join())) patterns.set(periods.join(),{ periods,loads,basis });
    };
    for (const o of course.outline) if (o.periods?.length) addPattern(o.periods.map(p=>p.period),o.periods.map(p=>p.credits),'Programme outline');
    const explicitPeriod = notes.match(/period ([1-4])/i);
    if (!patterns.size && explicitPeriod) addPattern([Number(explicitPeriod[1])],[course.credits],'Programme outline');
    // Retain every known pattern, including spring repeats and courses without
    // a period grid in the outline. Repeating published patterns is provisional.
    for (const o of published) if (o.slots.every(p=>p.academicYear===o.slots[0].academicYear)) {
      addPattern(o.slots.map(p=>p.period),o.loads,'Previous published offering');
    }
    for (let offset = 0; offset < years; offset++) for (const pattern of patterns.values()) {
      const year = startYear + offset;
      const calendarYear = year + (pattern.periods[0] >= 3 ? 1 : 0);
      if (/even years/i.test(notes) && calendarYear % 2 !== 0) continue;
      if (/odd years/i.test(notes) && calendarYear % 2 !== 1) continue;
      const periods = pattern.periods.map(p => offset * 4 + p - 1);
      // Do not project a different placement over a published offering in that term.
      if (results.some(o => o.confirmed && Math.floor(o.periods[0] / 2) === Math.floor(periods[0] / 2))) continue;
      results.push({ periods, loads: pattern.loads, confirmed: false, dates: 'Future offering not yet confirmed', source: pattern.basis, loadBasis: `${pattern.basis} pattern; provisional` });
    }
  }
  return results.sort((a, b) => a.periods[0] - b.periods[0]);
}

export function makePlan(courses, path, completed, { startYear = 2026, years = 2, capacity = 15, projections = true, startPeriod = 1 } = {}) {
  if (!Number.isInteger(startYear) || !Number.isInteger(years) || years < 1 || !Number.isFinite(capacity) || capacity <= 0 || !Number.isInteger(startPeriod) || startPeriod < 1 || startPeriod > 4) throw new Error('Invalid planning settings');
  const byId = new Map(courses.map(c => [c.id, c]));
  const loads = Array(years * 4).fill(0), scheduled = new Map(), unscheduled = [];
  const ids = [...path.included].filter(id => !completed.has(id)).sort((a, b) => path.levels.get(a) - path.levels.get(b) || a.localeCompare(b));
  for (const id of ids) {
    const course = byId.get(id);
    const dependencies = path.edges.filter(e => e.to === id && !completed.has(e.from));
    const options = offeringsFor(course, startYear, years, projections);
    const fits = o => o.periods[0] >= startPeriod - 1 &&
      dependencies.every(e => {
        const prerequisite = scheduled.get(e.from);
        return prerequisite && (e.kind === 'parallel' ? prerequisite.periods[0] <= o.periods[0] : prerequisite.periods.at(-1) < o.periods[0]);
      }) && o.periods.every((period, i) => (loads[period] ?? 0) + o.loads[i] <= capacity + .001);
    const available = options.find(fits);
    if (available) {
      scheduled.set(id, available);
      available.periods.forEach((period, i) => { loads[period] = Number((loads[period]+available.loads[i]).toFixed(2)); });
    } else {
      const blocked = dependencies.filter(e=>!scheduled.has(e.from)).map(e=>byId.get(e.from).title);
      const availability = options.map(o=>`${formatPeriods(startYear,o.periods)}${o.confirmed ? '' : ' (provisional)'}`).join('; ');
      const next = !blocked.length && offeringsFor(course,startYear,years+2,projections).find(o=>o.periods.at(-1)>=years*4 && fits(o));
      const nextOffering = next ? { ...next, requiredYears: Math.floor(next.periods.at(-1)/4)+1 } : null;
      unscheduled.push({ id, reason: next ? `The next offering after these prerequisites is ${formatPeriods(startYear,next.periods)}${next.confirmed ? '' : ' (provisional)'}, outside this ${years}-year window.`
        : !options.length ? 'No offering with known teaching periods in this planning window.'
        : blocked.length ? `First place: ${blocked.join(', ')}.`
        : 'The available periods do not fit after prerequisites within the chosen credit limit.', availability, nextOffering });
    }
  }
  return { scheduled, unscheduled, loads };
}
