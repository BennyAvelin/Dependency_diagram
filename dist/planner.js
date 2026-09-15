import { rules } from './rules.js';
import { periodsForDates, formatPeriods, periodInfo } from './calendar.js';
import { allowedProgrammeSemesters } from './programme.js';

export function validateCatalogue(courses, ruleSet = rules) {
  if (!Array.isArray(courses) || !courses.length) throw new Error('Catalogue must contain a non-empty courses array');
  if (!ruleSet || typeof ruleSet !== 'object') throw new Error('Invalid dependency rules');
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const officialUrl = (value, page, query) => {
    if (!text(value) || value !== value.trim()) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && ['uu.se', 'www.uu.se'].includes(url.hostname) &&
        !url.username && !url.password && !url.port && url.pathname === `/en/study/${page}` &&
        text(url.searchParams.get('query')) && (query === undefined || url.searchParams.get('query') === query);
    } catch { return false; }
  };
  const byId = new Map();
  for (const c of courses) {
    if (!c || !text(c.id) || byId.has(c.id)) throw new Error(`Duplicate or missing course ID: ${c?.id}`);
    if (!text(c.title) || !Number.isFinite(c.credits) || c.credits <= 0) throw new Error(`Invalid course: ${c.id}`);
    const invalid = field => { throw new Error(`Invalid ${field} for ${c.id}`); };
    if (!officialUrl(c.source, 'course', c.id)) invalid('course source URL');
    if (c.syllabus != null && !officialUrl(c.syllabus, 'syllabus')) invalid('syllabus URL');
    if (!Array.isArray(c.requirements) || !c.requirements.length || !c.requirements.every(text)) invalid('requirements');
    if (c.subjectLevels !== undefined && (!Array.isArray(c.subjectLevels) || c.subjectLevels.some(entry =>
      !entry || !text(entry.subject) || typeof entry.level !== 'string' || !/^[AG][12][A-Z]$/.test(entry.level)))) invalid('subject levels');
    if (!Array.isArray(c.outline) || !c.outline.length) invalid('outline');
    for (const entry of c.outline) {
      if (!entry || !Number.isInteger(entry.semester) || entry.semester < 1 || entry.semester > 4 ||
          !text(entry.group) || typeof entry.note !== 'string' || !Array.isArray(entry.periods)) invalid('outline entry');
      let previous = 0, credits = 0;
      for (const slot of entry.periods) {
        if (!slot || !Number.isInteger(slot.period) || slot.period <= previous || slot.period > 4 ||
            !Number.isFinite(slot.credits) || slot.credits <= 0) invalid('outline periods');
        previous = slot.period; credits += slot.credits;
      }
      // Empty grids are legitimate unknown periods. Validate each track's
      // credit split separately; repeated entries are not extra study load.
      if (entry.periods.length && Math.abs(credits - c.credits) >= .01) invalid('outline credit total');
    }
    if (!Array.isArray(c.offerings)) invalid('offerings');
    for (const offering of c.offerings) {
      if (!offering || !text(offering.dates) || !parseOffering(offering.dates)) invalid('offering dates');
      for (const field of ['pace', 'location']) if (offering[field] != null && typeof offering[field] !== 'string') invalid(`offering ${field}`);
    }
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
      if (!g || !['completed', 'participation', 'parallel'].includes(g.kind) || !Array.isArray(g.options) || !g.options.length) throw new Error(`Invalid requirement for ${id}`);
      for (const o of g.options) {
        if (!o || Boolean(o.course) === Boolean(o.external) || (o.course ? !text(o.course) : !text(o.external))) throw new Error(`Invalid prerequisite option for ${id}`);
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
    const semester = periodInfo(slots[0].academicYear, slots[0].period - 1);
    const fullSemester = slots.length === 2 && dates.start === semester.semesterDates[0] && dates.end === semester.semesterDates[1];
    const days = slots.reduce((n,p) => n+(p.days ?? 0),0);
    const loads = matchesOutline ? outline.periods.map(p=>p.credits)
      : slots.map(p => Number((course.credits * (fullSemester || !days ? 1/slots.length : p.days/days)).toFixed(2)));
    loads[loads.length-1] = Number((course.credits-loads.slice(0,-1).reduce((n,p)=>n+p,0)).toFixed(2));
    results.push({ slots, loads, confirmed: true, dates: raw.dates, source: course.source,
      loadBasis: matchesOutline ? 'Outline credit split' : fullSemester ? 'Estimated equal credit split across a full semester' : 'Estimated workload from the published date range' });
  }
  return results;
}

export function degreeProjectWindow(course) {
  // These 30-credit projects have reviewed whole-semester placements. Do not
  // infer period patterns for other courses from semester-only outline rows.
  if (!['1MA080', '1MA182'].includes(course.id)) return null;
  const semesters = [...new Set(course.outline.map(o => o.semester).filter(s => s === 3 || s === 4))].sort();
  return semesters.length ? { semesters, earliestPeriod: (semesters[0] - 1) * 2 } : null;
}

export function offeringsFor(course, startYear, years = 2, projections = true) {
  const results = [];
  const published = publishedOfferings(course);
  const projectWindow = degreeProjectWindow(course);
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
    for (const semester of projectWindow?.semesters ?? []) {
      const first = (semester % 2 === 1) ? 1 : 3;
      addPattern([first, first + 1], [course.credits / 2, course.credits / 2], 'Programme outline: full-semester degree project; estimated equal credit split');
    }
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
      if (projectWindow && periods[0] < projectWindow.earliestPeriod) continue;
      // Do not project a different placement over a published offering in that term.
      if (results.some(o => o.confirmed && Math.floor(o.periods[0] / 2) === Math.floor(periods[0] / 2))) continue;
      results.push({ periods, loads: pattern.loads, confirmed: false, dates: 'Future offering not yet confirmed', source: pattern.basis, loadBasis: `${pattern.basis} pattern; provisional` });
    }
  }
  return results.sort((a, b) => a.periods[0] - b.periods[0]);
}

export function makePlan(courses, path, completed, { startYear = 2026, years: requestedYears = 2, capacity = 15, projections = true, startPeriod = 1 } = {}) {
  if (!Number.isInteger(startYear) || !Number.isInteger(requestedYears) || requestedYears < 1 || !Number.isFinite(capacity) || capacity <= 0 || !Number.isInteger(startPeriod) || startPeriod < 1 || startPeriod > 4) throw new Error('Invalid planning settings');
  // The chosen window is a minimum. Search further so a prerequisite chain or
  // biennial rotation cannot silently drop a target from the visible plan.
  const years = Math.max(requestedYears, 8);
  const byId = new Map(courses.map(c => [c.id, c]));
  const loads = Array(years * 4).fill(0), scheduled = new Map(), unscheduled = [];
  // Full-semester projects are flexible end-of-programme work. Place ordinary
  // course paths first so a project cannot consume a scarce taught-course slot.
  // Only defer leaves, preserving dependency order if a future course has a
  // project as a prerequisite.
  const projectLeaves = new Set([...path.included].filter(id => degreeProjectWindow(byId.get(id)) && !path.edges.some(edge => edge.from === id)));
  const ids = [...path.included].filter(id => !completed.has(id)).sort((a, b) => Number(projectLeaves.has(a)) - Number(projectLeaves.has(b)) || path.levels.get(a) - path.levels.get(b) || a.localeCompare(b));
  for (const id of ids) {
    const course = byId.get(id);
    const earliestPeriod = Math.max(startPeriod - 1, degreeProjectWindow(course)?.earliestPeriod ?? 0);
    const dependencies = path.edges.filter(e => e.to === id && !completed.has(e.from));
    const options = offeringsFor(course, startYear, years, projections);
    const outlineSemesters = allowedProgrammeSemesters(course);
    const inOutline = o => o.periods.every(period => outlineSemesters.includes(Math.floor(period / 2) + 1));
    const fits = o => o.periods[0] >= earliestPeriod &&
      dependencies.every(e => {
        const prerequisite = scheduled.get(e.from);
        return prerequisite && (e.kind === 'parallel' ? prerequisite.periods[0] <= o.periods[0] : prerequisite.periods.at(-1) < o.periods[0]);
      }) && o.periods.every((period, i) => (loads[period] ?? 0) + o.loads[i] <= capacity + .001);
    const available = options.find(o => inOutline(o) && fits(o)) ?? options.find(fits);
    if (available) {
      scheduled.set(id, { ...available, outsideOutline: !inOutline(available), outlineSemesters });
      available.periods.forEach((period, i) => { loads[period] = Number((loads[period]+available.loads[i]).toFixed(2)); });
    } else {
      const blocked = dependencies.filter(e=>!scheduled.has(e.from)).map(e=>byId.get(e.from).title);
      const availability = options.map(o=>`${formatPeriods(startYear,o.periods)}${o.confirmed ? '' : ' (provisional)'}`).join('; ');
      const next = !blocked.length && offeringsFor(course,startYear,years+2,projections).find(o=>o.periods.at(-1)>=years*4 && fits(o));
      const nextOffering = next ? { ...next, requiredYears: Math.floor(next.periods.at(-1)/4)+1 } : null;
      unscheduled.push({ id, reason: next ? `The next offering after these prerequisites is ${formatPeriods(startYear,next.periods)}${next.confirmed ? '' : ' (provisional)'}, outside this ${years}-year window.`
        : !options.length ? 'No offering with known teaching periods in this planning window.'
        : blocked.length ? `First place: ${blocked.join(', ')}.`
        : `The available periods do not fit after prerequisites${degreeProjectWindow(course) ? ` and the programme’s semester-${degreeProjectWindow(course).semesters[0]} project start` : ''} within the chosen credit limit.`, availability, nextOffering });
    }
  }
  const displayedYears = Math.max(requestedYears, ...[...scheduled.values()].map(o => Math.floor(o.periods.at(-1) / 4) + 1));
  return { scheduled, unscheduled, loads: loads.slice(0, displayedYears * 4), years: displayedYears, requestedYears, searchYears: years };
}
