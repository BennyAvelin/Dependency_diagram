import { rules } from './rules.js';

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
  const m = dates.match(/(\d+) (\w+) (\d{4})[–-](\d+) (\w+) (\d{4})/);
  if (!m || !months[m[2]] || !months[m[5]]) return null;
  const start = `${m[3]}-${String(months[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const end = `${m[6]}-${String(months[m[5]]).padStart(2, '0')}-${m[4].padStart(2, '0')}`;
  return { start, end };
}

// Academic-year slots: P1 autumn first half; P2 autumn second half;
// P3 spring first half; P4 spring second half. Exact course dates remain visible.
function dateSlot(iso, end = false) {
  const [year, month, day] = iso.split('-').map(Number);
  if (month >= 8 && month <= 10) return { year, period: 1 };
  if (month >= 11) return { year, period: end && month === 11 && day <= 7 ? 1 : 2 };
  if (month === 1 && (end || day < 18)) return { year: year - 1, period: 2 };
  if (month < 3 || (month === 3 && day < 22)) return { year: year - 1, period: 3 };
  return { year: year - 1, period: 4 };
}

export function offeringsFor(course, startYear, years = 2, projections = false) {
  const results = [];
  for (const raw of course.offerings ?? []) {
    const dates = parseOffering(raw.dates);
    if (!dates) continue;
    const start = dateSlot(dates.start), end = dateSlot(dates.end, true);
    const first = (start.year - startYear) * 4 + start.period - 1;
    const last = (end.year - startYear) * 4 + end.period - 1;
    if (first < 0 || last >= years * 4 || last < first) continue;
    const periods = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const outline = course.outline.find(o => o.periods?.length && o.periods.map(p => p.period).join() === periods.map(p => p % 4 + 1).join());
    const loads = outline && Math.abs(outline.periods.reduce((sum, p) => sum + p.credits, 0) - course.credits) < .01 ? outline.periods.map(p => p.credits) : periods.map(() => course.credits / periods.length);
    results.push({ periods, loads, confirmed: true, dates: raw.dates, source: course.source });
  }
  if (projections) {
    const outline = course.outline.find(o => o.periods?.length);
    const notes = course.outline.map(o => o.note).join(' ');
    const explicitPeriod = notes.match(/period (\d)/i);
    // No invented within-semester placement: unknown periods stay unscheduled.
    const pattern = outline?.periods ?? (explicitPeriod ? [{ period: Number(explicitPeriod[1]), credits: course.credits }] : []);
    for (let offset = 0; offset < years && pattern.length; offset++) {
      const year = startYear + offset;
      const calendarYear = year + (pattern[0].period >= 3 ? 1 : 0);
      if (/even years/i.test(notes) && calendarYear % 2 !== 0) continue;
      if (/odd years/i.test(notes) && calendarYear % 2 !== 1) continue;
      const periods = pattern.map(p => offset * 4 + p.period - 1);
      // Do not project a different placement over a published offering in that term.
      if (results.some(o => Math.floor(o.periods[0] / 2) === Math.floor(periods[0] / 2))) continue;
      results.push({ periods, loads: pattern.map(p => p.credits), confirmed: false, dates: 'Projected from the programme outline; offering not confirmed', source: 'outline' });
    }
  }
  return results.sort((a, b) => a.periods[0] - b.periods[0]);
}

export function makePlan(courses, path, completed, { startYear = 2026, years = 2, capacity = 15, projections = false, startPeriod = 1 } = {}) {
  if (!Number.isInteger(startYear) || years < 1 || capacity <= 0 || startPeriod < 1 || startPeriod > 4) throw new Error('Invalid planning settings');
  const byId = new Map(courses.map(c => [c.id, c]));
  const loads = Array(years * 4).fill(0), scheduled = new Map(), unscheduled = [];
  const ids = [...path.included].filter(id => !completed.has(id)).sort((a, b) => path.levels.get(a) - path.levels.get(b) || a.localeCompare(b));
  for (const id of ids) {
    const course = byId.get(id);
    const dependencies = path.edges.filter(e => e.to === id && !completed.has(e.from));
    const options = offeringsFor(course, startYear, years, projections);
    const available = options.find(o => o.periods[0] >= startPeriod - 1 &&
      dependencies.every(e => {
        const prerequisite = scheduled.get(e.from);
        return prerequisite && (e.kind === 'parallel' ? prerequisite.periods[0] <= o.periods[0] : prerequisite.periods.at(-1) < o.periods[0]);
      }) && o.periods.every((period, i) => loads[period] + o.loads[i] <= capacity + .001));
    if (available) {
      scheduled.set(id, available);
      available.periods.forEach((period, i) => { loads[period] += available.loads[i]; });
    } else unscheduled.push({ id, reason: !options.length ? 'No offering with known teaching periods in this planning window.' : dependencies.some(e => !scheduled.has(e.from)) ? 'A prerequisite could not be placed.' : 'Published/projected periods do not fit after prerequisites within the chosen credit limit.' });
  }
  return { scheduled, unscheduled, loads };
}
