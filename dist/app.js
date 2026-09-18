import { rules, ruleNotes } from './rules.js';
import { validateCatalogue, dependencyPath, makePlan, offeringsFor, degreeProjectWindow, semesterOptions } from './planner.js';
import { periodInfo, formatOffering, periodSource } from './calendar.js';
import { planningVersion, restorePlanSettings } from './settings.js';
import { studyPlanView } from './plan-view.js';
import { assessProgrammePlan } from './programme.js';

const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const button = (text, className, action, label) => { const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', action); if (label) b.setAttribute('aria-label', label); return b; };
const storageKey = 'uppsala-course-atlas-v1';
let catalogue, courses, byId, path, plan;
let targets = new Set(), completed = new Set(), choices = {}, semesterChoices = {}, met = new Set();
let selected = '1MA338', startYear = 2026, capacity = 15, projections = true, years = 2;
let view = { x: 20, y: 20, scale: 1 }, world = { width: 1000, height: 500 };
let persistence = true;
const svgNS = 'http://www.w3.org/2000/svg';

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({ targets: [...targets], completed: [...completed], choices, semesterChoices, met: [...met], startYear, capacity, projections, years, planningVersion })); }
  catch { persistence = false; }
  $('save-state').textContent = persistence ? 'Saved in this browser only' : 'Browser storage unavailable; download your plan to keep it';
}
function restore() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    const data = restorePlanSettings(JSON.parse(stored),courses,rules);
    targets = new Set(data.targets); completed = new Set(data.completed);
    choices = data.choices; semesterChoices = data.semesterChoices; met = new Set(data.met);
    startYear = data.startYear; capacity = data.capacity;
    projections = data.projections; years = data.years;
    selected = targets.values().next().value ?? courses[0].id;
  } catch { persistence = false; }
}
function setTarget(id, enabled = !targets.has(id)) {
  if (!byId.has(id)) throw new Error(`Unknown course: ${id}`);
  enabled ? targets.add(id) : targets.delete(id);
  selected = id;
  render(true);
  $('announcement').textContent = `${byId.get(id).title} ${enabled ? 'added to' : 'removed from'} targets.`;
}
function restoreFocus(id) { if (id) document.getElementById(id)?.focus({ preventScroll: true }); }
function selectCourse(id) { const focusId = document.activeElement?.id; selected = id; renderDetails(); renderCatalogue(); renderMap(false); restoreFocus(focusId); }
function setCompleted(id, enabled) { enabled ? completed.add(id) : completed.delete(id); render(true); }
function optionLabel(option) { return option.course ? `${byId.get(option.course).title} (${option.course})` : option.external; }
function offeringLabel(c) {
  const planned = plan?.scheduled.get(c.id);
  if (planned) return formatOffering(startYear,planned);
  const available = offeringsFor(c,startYear,plan.years,projections);
  return available.length ? formatOffering(startYear,available[0]) : 'Period to be confirmed';
}
function sourceLink(url, title) { const a = el('a', 'source-link', title); a.href = url; a.target = '_blank'; a.rel = 'noreferrer'; return a; }

function semesterControl(course, location) {
  const options = semesterOptions(course, startYear, plan.searchYears, projections);
  const chosen = semesterChoices[course.id];
  if (options.length < 2 && !chosen) return null;
  const wrapper = el('div', 'semester-choice');
  const label = el('label', '', location === 'plan' ? course.title : 'Take this course in');
  const select = el('select'); select.id = `semester-${location}-${course.id}`; label.htmlFor = select.id;
  const automatic = el('option', '', degreeProjectWindow(course) ? 'Automatic · Semester 4 (final semester)' : 'Automatic · Follow programme outline'); automatic.value = ''; select.append(automatic);
  for (const option of options) {
    const info = periodInfo(startYear, (option.semester - 1) * 2);
    const item = el('option', '', `Semester ${option.semester} · ${info.term} ${info.year}${option.exceptional ? ' · Exceptional' : ''}${option.outsideOutline ? ' · Outside outline' : ''}${option.semesterOnly ? ' · Schedule not yet published' : option.confirmed ? '' : ' · Provisional'}`);
    item.value = option.semester; select.append(item);
  }
  if (chosen && !options.some(option => option.semester === chosen)) {
    const unavailable = el('option', '', `Semester ${chosen} · No offering in current mode`); unavailable.value = chosen; select.append(unavailable);
  }
  select.value = chosen ?? '';
  select.addEventListener('change', () => {
    if (select.value) semesterChoices[course.id] = Number(select.value); else delete semesterChoices[course.id];
    render();
    $('announcement').textContent = `${course.title}: ${semesterChoices[course.id] ? `semester ${semesterChoices[course.id]} selected` : 'automatic placement restored'}. Study plan updated.`;
  });
  wrapper.append(label, select);
  if (chosen === 3 && course.id === '1MA080') wrapper.append(el('p', 'outline-warning', 'Exceptional semester 3 project: review this choice with the programme adviser.'));
  return wrapper;
}

function renderTargets() {
  $('targets').replaceChildren();
  if (!targets.size) $('targets').append(el('span', 'empty-note', 'Add courses from the catalogue below.'));
  for (const id of targets) $('targets').append(button(`${byId.get(id).title} ×`, 'target-chip', () => setTarget(id, false), `Remove ${byId.get(id).title} from targets`));
  $('clear').disabled = !targets.size;
}
function renderCatalogue() {
  const query = $('search').value.trim().toLowerCase(), track = $('track').value;
  const filtered = courses.filter(c => `${c.id} ${c.title}`.toLowerCase().includes(query) && (track === 'all' || c.outline.some(o => o.group === track)));
  $('catalogue-count').textContent = filtered.length;
  const nodes = filtered.map(c => {
    const row = el('div', `catalogue-row${selected === c.id ? ' active' : ''}`);
    const item = button('', 'course-item', () => selectCourse(c.id));
    item.id = `catalogue-${c.id}`;
    item.setAttribute('aria-pressed', String(selected === c.id));
    item.append(el('small', '', `${c.id} · ${c.credits} cr${completed.has(c.id) ? ' · Studied' : ''}`), el('span', '', c.title));
    const add = button(targets.has(c.id) ? '✓' : '+', `add-target${targets.has(c.id) ? ' added' : ''}`, () => setTarget(c.id), `${targets.has(c.id) ? 'Remove' : 'Add'} ${c.title} ${targets.has(c.id) ? 'from' : 'to'} targets`);
    add.id = `add-${c.id}`;
    add.setAttribute('aria-pressed', String(targets.has(c.id)));
    row.append(item, add); return row;
  });
  $('course-list').replaceChildren(...nodes);
  if (!filtered.length) $('course-list').append(el('p', 'empty-note list-help', 'No courses match. Try a different name, code or track.'));
}
function renderDetails() {
  const c = byId.get(selected); if (!c) return;
  const container = $('details');
  container.replaceChildren(el('p', 'detail-eyebrow', 'COURSE DETAILS'), el('span', 'detail-code', c.id), el('h2', '', c.title));
  container.append(el('p', 'detail-description', `${c.credits} credits · ${plan.scheduled.has(c.id) ? 'Planned' : 'Available'}: ${offeringLabel(c)}`));
  const projectWindow = degreeProjectWindow(c);
  if (projectWindow) container.append(el('p', 'empty-note', `Programme placement: semester ${projectWindow.semesters.join(' or ')}, relative to your starting autumn. Default: semester 4, the final semester. Mathematics semester 3 is an exceptional choice. Planned with an estimated 15 credits in each half of the semester. The required 30 advanced-level credits and project approval still need review.`));
  const unplaced = plan.unscheduled.find(item=>item.id===c.id);
  if (unplaced) container.append(el('p', 'empty-note', `Not placed: ${unplaced.reason}`));
  const targetButton = button(targets.has(c.id) ? 'Remove target' : '+ Add as target', 'primary-button', () => setTarget(c.id));
  targetButton.id = `detail-target-${c.id}`;
  container.append(targetButton);
  const studied = el('label', 'check-label studied-check');
  const check = el('input'); check.type = 'checkbox'; check.checked = completed.has(c.id); check.id = `studied-${c.id}`;
  check.addEventListener('change', () => setCompleted(c.id, check.checked));
  studied.append(check, el('span', '', 'Already studied / requirement met'));
  container.append(studied, el('p', 'empty-note', 'Use only when your prior studies meet this course’s role in the path. A passed-course requirement still requires a pass.'));
  if (!completed.has(c.id)) { const choice = semesterControl(c, 'detail'); if (choice) container.append(choice); }
  container.append(el('h3', '', 'Prerequisite route'));
  if (!rules[c.id].length) container.append(el('p', 'empty-note', 'No individual course links mapped. Review the credit, subject and other conditions below.'));
  rules[c.id].forEach((g, i) => {
    const key = `${c.id}:${i}`;
    const selectedOption = choices[key] ?? Math.max(0, g.options.findIndex(o => o.course && completed.has(o.course)));
    const wrapper = el('div', 'requirement-group');
    wrapper.append(el('span', 'requirement-kind', g.kind === 'parallel' ? 'May be studied in parallel' : g.kind === 'participation' ? 'Prior participation' : 'Completed course'));
    if (g.options.length > 1) {
      const select = el('select'); select.id = `choice-${c.id}-${i}`; select.setAttribute('aria-label', `Alternative prerequisite ${i+1} for ${c.title}`);
      g.options.forEach((o, n) => { const option = el('option', '', optionLabel(o)); option.value = n; select.append(option); });
      select.value = selectedOption;
      select.addEventListener('change', () => { choices[key] = Number(select.value); render(true); });
      wrapper.append(select, el('small', 'empty-note', 'Choose one route; alternatives are not all required.'));
    }
    const chosen = g.options[selectedOption];
    if (chosen.course) wrapper.append(button(optionLabel(chosen), 'related-course', () => selectCourse(chosen.course)));
    else wrapper.append(el('p', 'empty-note', chosen.external));
    container.append(wrapper);
  });
  if (ruleNotes[c.id]) container.append(el('p', 'empty-note', ruleNotes[c.id]));
  const requirements = el('details', 'official-requirements');
  requirements.append(el('summary', '', 'Official entry requirements'));
  c.requirements.forEach(text => requirements.append(el('p', 'detail-description', text)));
  if (!c.requirements.length) requirements.append(el('p', 'empty-note', 'Requirements could not be retrieved. Check the official page.'));
  requirements.append(sourceLink(c.source, 'Course page ↗'));
  if (c.syllabus) requirements.append(sourceLink(c.syllabus, 'Syllabus ↗'));
  container.append(requirements, el('h3', '', 'Teaching periods in this plan window'));
  const available = offeringsFor(c,startYear,plan.years,projections), placed = plan.scheduled.get(c.id);
  if (!available.length) container.append(el('p', 'empty-note', 'No offering with known periods in this window. Check the outline notes and course page.'));
  for (const o of available) {
    const isPlaced = placed?.periods.join() === o.periods.join();
    const item = el('div', 'course-offering');
    item.append(el('strong', '', formatOffering(startYear,o)), el('p', 'empty-note', `${isPlaced ? 'In your study plan · ' : ''}${o.semesterOnly ? 'Schedule not yet published · Semester from outline' : o.confirmed ? o.dates : 'Provisional future offering'}`), el('small', 'empty-note', o.loadBasis));
    if (projectWindow && o.periods[0] < projectWindow.earliestPeriod) item.append(el('p', 'empty-note', `Published for an earlier programme stage; this plan starts the project in semester ${projectWindow.semesters[0]} or later.`));
    container.append(item);
  }
  container.append(sourceLink(c.source, 'Published course dates ↗'));
  [...new Set(c.outline.map(o => o.note).filter(Boolean))].forEach(note => container.append(el('p', 'empty-note', note)));
}

function transform() {
  $('world').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  $('zoom-label').textContent = `${Math.round(view.scale * 100)}%`;
  $('zoom-in').disabled = view.scale >= 2;
  $('zoom-out').disabled = view.scale <= .15;
}
function fit() {
  const viewport = $('viewport');
  view.scale = Math.min(1, Math.max(.15, Math.min((viewport.clientWidth - 40) / world.width, (viewport.clientHeight - 50) / world.height)));
  view.x = (viewport.clientWidth - world.width * view.scale) / 2;
  view.y = (viewport.clientHeight - world.height * view.scale) / 2;
  transform();
}
function zoom(multiplier) {
  const next = Math.min(2, Math.max(.15, view.scale * multiplier));
  const center = { x: $('viewport').clientWidth / 2, y: $('viewport').clientHeight / 2 };
  view.x = center.x - (center.x - view.x) * next / view.scale;
  view.y = center.y - (center.y - view.y) * next / view.scale;
  view.scale = next; transform();
}
function renderMap(refit) {
  const nodes = $('nodes'), svg = $('connections'); nodes.replaceChildren(); svg.replaceChildren();
  $('map-empty').hidden = path.included.size > 0;
  const positions = new Map(), counts = new Map();
  for (const id of [...path.included].sort((a,b) => path.levels.get(a)-path.levels.get(b) || a.localeCompare(b))) {
    const level = path.levels.get(id), row = counts.get(level) ?? 0;
    counts.set(level, row + 1); positions.set(id, { x: level * 290 + 15, y: row * 150 + 60 });
  }
  world = { width: (Math.max(0, ...counts.keys()) + 1) * 290 - 35, height: Math.max(1, ...counts.values()) * 150 + 60 };
  $('world').style.width = `${world.width}px`; $('world').style.height = `${world.height}px`;
  for (const level of counts.keys()) { const label = el('span', 'level-label', level === 0 ? 'STARTING POINTS' : `STEP ${level + 1}`); label.style.left = `${level * 290 + 15}px`; label.style.top = '16px'; nodes.append(label); }
  for (const edge of path.edges) {
    const from = positions.get(edge.from), to = positions.get(edge.to), start = from.x + 220, end = to.x, sy = from.y + 55, ey = to.y + 55;
    const line = document.createElementNS(svgNS, 'path');
    line.setAttribute('d', `M ${start} ${sy} C ${start+40} ${sy}, ${end-40} ${ey}, ${end-6} ${ey}`);
    line.setAttribute('class', `edge${edge.kind === 'parallel' ? ' parallel' : ''}`);
    svg.append(line);
    const arrow = document.createElementNS(svgNS, 'path'); arrow.setAttribute('d', `M ${end-11} ${ey-4} L ${end-5} ${ey} L ${end-11} ${ey+4}`); arrow.setAttribute('class', 'edge'); svg.append(arrow);
  }
  for (const [id, position] of positions) {
    const c = byId.get(id), node = button('', `node${targets.has(id) ? ' target-node' : ''}${completed.has(id) ? ' complete-node' : ''}${selected === id ? ' selected' : ''}`, () => selectCourse(id), `${c.title}, ${c.id}, ${completed.has(id) ? 'already studied' : targets.has(id) ? 'target course' : 'prerequisite'}. Show details.`);
    node.style.left = `${position.x}px`; node.style.top = `${position.y}px`; node.style.setProperty('--area', '#438866');
    node.id = `node-${id}`;
    node.setAttribute('aria-pressed', String(selected === id));
    const top = el('span', 'node-top'); top.append(el('span', '', c.id), el('span', '', `${c.credits} cr`));
    node.append(top, el('strong', '', c.title), el('span', 'node-status', completed.has(id) ? '✓ Already studied' : targets.has(id) ? '◎ Target' : offeringLabel(c)));
    nodes.append(node);
  }
  const needed = [...path.included].filter(id => !completed.has(id));
  $('path-summary').textContent = `${targets.size} targets · ${needed.length} courses to study · ${needed.reduce((n,id) => n+byId.get(id).credits,0)} credits on this path`;
  if (refit) fit();
}

function renderProgrammeAssessment() {
  const report = assessProgrammePlan(courses, plan, { completed, targets });
  const panel = $('programme-assessment'); panel.replaceChildren();
  if (!targets.size) return;
  panel.append(el('h3', '', 'Programme outline check'));
  const headline = report.outlineComplete ? 'Semester layout complete · Degree requirements need review' : report.extendedCourseIds.length ? 'Extended route · Standard programme still incomplete' : 'Study plan needs completion or adjustment';
  panel.append(el('p', 'programme-headline', headline));
  panel.append(el('p', '', `${report.programmeCredits} / 120 credits planned in semesters 1–4${report.creditGap ? ` · ${report.creditGap} credits still to allocate` : ''}${report.creditOverload ? ` · ${report.creditOverload} credits above 120` : ''}. Already-studied markers are used for prerequisites and are excluded from these totals.`));
  const loads = el('div', 'programme-loads');
  for (const semester of report.semesters) {
    loads.append(el('p', semester.overload ? 'outline-warning' : '', `Semester ${semester.semester}: ${semester.credits} / 30 cr${semester.gap ? ` · ${semester.gap} to allocate` : ''}${semester.overload ? ` · ${semester.overload} above normal load` : ''}`));
  }
  panel.append(loads);
  panel.append(el('p', '', report.degreeProject.missing ? 'A 30-credit degree project is still needed in an outline-supported semester. Mathematics: semester 3 or 4. Financial Mathematics: semester 4.' : `30-credit degree project placed: ${report.degreeProject.courseIds.map(id => byId.get(id).title).join(', ')}. Its entry requirements still need review.`));
  if (report.targetPathIncomplete) panel.append(el('p', 'outline-warning', 'Some targets or prerequisites remain unplaced. See the planning decisions below.'));
  if (report.unsupportedPlacements.length) {
    const deviations = el('ul');
    for (const placement of report.unsupportedPlacements) deviations.append(el('li', '', `${placement.title}: ${placement.reason}`));
    panel.append(el('p', 'outline-warning', 'Placements needing an individual exception to the outline:'), deviations);
  }
  const details = el('details'); details.append(el('summary', '', 'Subject credits and degree requirements'));
  const subjects = Object.entries(report.mainFieldAdvancedCredits).map(([subject, credits]) => `${subject}: ${credits} cr`).join('; ');
  details.append(el('p', '', `Advanced credits by main field: ${subjects || 'none planned'}. The degree requires at least 60 advanced credits in the chosen main field, including the project. A course listed in several fields counts once toward the 120-credit workload.`));
  details.append(el('p', '', `${report.basicCredits} basic-level credits planned${report.bridgingCredits ? `, including ${report.bridgingCredits} bridging credits` : ''}. Up to 30 may qualify if they add competence and were not included in the Bachelor’s degree.${report.basicCreditOverload ? ` ${report.basicCreditOverload} basic credits exceed that limit.` : ''}${report.unknownLevelCredits ? ` ${report.unknownLevelCredits} credits have an unverified level.` : ''}`));
  details.append(el('p', '', 'Tracks are proposed and flexible. Add elective choices to complete the plan, and review track changes, degree inclusion, prior results and formal eligibility with the programme adviser. Course placement does not confirm admission or degree approval.'));
  details.append(sourceLink(report.sources.outline, 'Programme outline ↗'), sourceLink(report.sources.syllabus, 'Programme syllabus ↗'));
  panel.append(details);
}

function renderPlan() {
  const timeline = $('timeline'); timeline.replaceChildren();
  const view = studyPlanView(plan, targets, completed, startYear);
  $('target-outcomes').replaceChildren();
  for (const target of view.targets) {
    const row = button('', `target-outcome ${target.status}`, () => {
      const card = document.getElementById(`plan-${target.id}`);
      selectCourse(target.id);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.focus({ preventScroll: true }); }
      else $('details').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    row.append(el('strong', '', byId.get(target.id).title), el('span', '', target.label));
    $('target-outcomes').append(row);
  }
  let projectedCount = 0;
  for (const info of view.semesters) {
    const semester = info.index;
    const column = el('section', `semester${info.beyondProgramme ? ' extended-semester' : ''}`);
    column.append(el('h3', '', `${info.term} ${info.year}`), el('p', 'semester-subtitle', `Semester ${info.semester} · ${info.semesterDates.join(' – ')}${info.semesterDatesPublished ? '' : ' (calculated)'}`));
    if (info.beyondProgramme) column.append(el('p', 'extension-label', 'Beyond the standard 2-year programme'));
    const semesterReservations = [...plan.scheduled].filter(([, offering]) => offering.semesterOnly && Math.floor(offering.periods[0]/2) === semester);
    if (semesterReservations.length) {
      const pending = el('div', 'semester-reservations');
      pending.append(el('h4', '', 'Schedule not yet published'));
      for (const [id, offering] of semesterReservations) {
        projectedCount++;
        const item = button('', 'plan-course projected', () => { selectCourse(id); $('details').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
        item.id = `plan-${id}`;
        item.append(el('small', '', `${id} · ${byId.get(id).credits} cr this semester`), el('strong', '', byId.get(id).title), el('span', '', 'Semester from outline · Exact periods not yet planned'));
        if (offering.chosenSemester) item.append(el('span', '', `Your choice: semester ${offering.chosenSemester}`));
        if (offering.outsideOutline) item.append(el('span', 'outline-warning', 'Outside listed programme semester · Review required'));
        pending.append(item);
      }
      pending.append(el('p', 'empty-note', 'Workload is temporarily split equally across the semester for capacity estimates. Confirm the teaching periods before finalising your plan.'));
      column.append(pending);
    }
    for (let half = 0; half < 2; half++) {
      const index = semester * 2 + half;
      const period = el('div', 'period');
      const slot = periodInfo(startYear,index);
      const heading = el('div', 'period-heading'); heading.append(el('strong', '', `P${slot.period}`), el('span', '', `${plan.loads[index]}${capacity === 'unlimited' ? ' cr · No limit' : ` / ${capacity} cr`}${semesterReservations.length ? ' (estimated)' : ''}`)); period.append(heading);
      period.append(el('p', 'period-dates', slot.start ? `${slot.start} – ${slot.end}` : 'Exact period dates not yet published'));
      let count = 0;
      for (const [id, offering] of plan.scheduled) {
        const position = offering.periods.indexOf(index); if (position === -1 || offering.semesterOnly) continue;
        count++;
        if (!offering.confirmed && position === 0) projectedCount++;
        const item = button('', `plan-course${offering.confirmed ? '' : ' projected'}${targets.has(id) ? ' plan-target' : ''}`, () => { selectCourse(id); $('details').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
        if (position === 0) item.id = `plan-${id}`;
        item.append(el('small', '', `${id} · ${offering.loads[position]} cr this period`), el('strong', '', byId.get(id).title), el('span', '', offering.confirmed ? 'Published offering' : 'Provisional offering'));
        if (offering.exceptionalProject) item.append(el('span', 'outline-warning', 'Semester 3 exception · Adviser review needed'));
        if (offering.chosenSemester) item.append(el('span', '', `Your choice: semester ${offering.chosenSemester}`));
        if (offering.outsideOutline) item.append(el('span', 'outline-warning', `Outside outline semester ${offering.outlineSemesters.join(' / ')} · Review required`));
        item.title = `${formatOffering(startYear,offering)} · ${offering.dates} · ${offering.loadBasis}`; period.append(item);
      }
      if (!count) period.append(el('p', 'empty-period', semesterReservations.length ? 'Semester reservations above have no exact period yet' : 'No selected course scheduled in this period'));
      column.append(period);
    }
    timeline.append(column);
  }
  const credits = [...plan.scheduled.keys()].reduce((sum,id) => sum + byId.get(id).credits,0);
  $('plan-summary').textContent = targets.size ? `${plan.scheduled.size} courses placed · ${credits} credits of study${projectedCount ? ` · ${projectedCount} projected offerings` : ''}${plan.unscheduled.length ? ` · ${plan.unscheduled.length} unplaced` : ''}. Placement is conditional on the entry requirements below; these are not degree-credit totals.` : 'Choose targets to generate a suggested study order.';
  $('unplaced').replaceChildren();
  if (plan.unscheduled.length) {
    $('unplaced').append(el('h3', '', 'Needs a planning decision'));
    for (const item of plan.unscheduled) {
      const row = el('div', 'unplaced-row');
      row.append(button(byId.get(item.id).title, 'text-button', () => selectCourse(item.id)), el('span', '', `${item.reason}${item.availability ? ` Offerings checked across ${plan.searchYears} academic years: ${item.availability}` : ''}`));
      $('unplaced').append(row);
    }
    if (!projections) $('unplaced').append(button('Include provisional future offerings to plan later semesters', 'secondary-button', () => { projections = true; $('projections').checked = true; render(); }));
  }
  const semesterControls = $('semester-choices'); semesterControls.replaceChildren();
  for (const id of path.included) {
    if (completed.has(id)) continue;
    const control = semesterControl(byId.get(id), 'plan');
    if (control) semesterControls.append(control);
  }
  $('semester-choice-panel').hidden = !semesterControls.childElementCount;
  renderProgrammeAssessment();
  renderReview();
  const extension = view.extended ? `Automatically extended from ${years} to ${plan.years} academic years to include later scheduled courses. ` : '';
  $('planning-mode').textContent = extension + (projections ? `Showing ${plan.years} academic years using published offerings and provisional repeats. Dashed course cards need confirmation.` : 'Published offerings only. Later semesters may be empty because their course instances have not yet been published.') + (plan.unscheduled.length ? ` Unplaced courses were checked across ${plan.searchYears} academic years.` : '');
  $('export').disabled = !targets.size;
}
function renderReview() {
  const background = $('background'); background.replaceChildren();
  const grouped = new Map();
  for (const requirement of path.external) {
    if (!grouped.has(requirement.label)) grouped.set(requirement.label, []);
    grouped.get(requirement.label).push(requirement);
  }
  for (const [label, requirements] of grouped) {
    const row = el('label', 'background-row'), input = el('input'); input.type = 'checkbox'; input.checked = met.has(label);
    input.addEventListener('change', () => { input.checked ? met.add(label) : met.delete(label); save(); updateReviewSummary(); });
    const content = el('span'); content.append(el('strong', '', label), el('small', '', requirements.map(r => `${byId.get(r.course).title} (${r.kind === 'parallel' ? 'parallel allowed' : r.kind})`).join('; ')));
    row.append(input, content); background.append(row);
  }
  if (!grouped.size) background.append(el('p', 'empty-note', 'No additional named background courses on this selected route. Credit, subject and other entry conditions still need review.'));
  const eligibility = $('eligibility'); eligibility.replaceChildren(el('h3', '', 'Credit totals, subject background & other conditions'));
  for (const id of path.included) {
    if (completed.has(id)) continue;
    const c = byId.get(id), item = el('details', 'eligibility-course'); item.append(el('summary', '', `${c.id} · ${c.title}`));
    c.requirements.forEach(text => item.append(el('p', '', text)));
    item.append(sourceLink(c.source, 'Verify official entry requirements ↗')); eligibility.append(item);
  }
  updateReviewSummary();
}
function updateReviewSummary() {
  const count = new Set(path.external.filter(r => !met.has(r.label)).map(r => r.label)).size;
  $('review-summary').textContent = `Entry requirements to review · ${count} background items unchecked · formal eligibility requires review`;
}
function render(refit = false) {
  const focusId = document.activeElement?.id;
  path = dependencyPath(targets, completed, choices);
  plan = makePlan(courses, path, completed, { startYear, capacity, projections, years, semesterChoices });
  renderTargets(); renderCatalogue(); renderDetails(); renderMap(refit); renderPlan(); save(); restoreFocus(focusId);
}
function exportPlan() {
  const payload = { format: 'uppsala-course-atlas-plan-v2', generatedAt: new Date().toISOString(), outline: catalogue.outlineSource, periodSource, sourceCheckedOn: catalogue.checkedOn, targets: [...targets], alreadyStudied: [...completed], choices, semesterChoices, backgroundMarkedMet: [...met], settings: { startYear, capacity, projections, years, displayedYears: plan.years, searchYears: plan.searchYears }, targetOutcomes: studyPlanView(plan, targets, completed, startYear).targets, scheduled: [...plan.scheduled].map(([id,o]) => ({ id, title: byId.get(id).title, ...o, periods: o.periods.map(p => ({ ...periodInfo(startYear,p), ...(o.semesterOnly ? { estimatedReservation: true, start: null, end: null } : {}) })) })), unplaced: plan.unscheduled, note: 'A conditional planning suggestion, not an admission or degree assessment. Formal eligibility, future offerings and timetable conflicts require review.' };
  payload.programmeAssessment = assessProgrammePlan(courses, plan, { completed, targets });
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)], { type: 'application/json' }));
  const a = el('a'); a.href = url; a.download = 'uppsala-mathematics-study-plan.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}

function registerAgentTools() {
  if (!document.modelContext?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  try {
    Promise.resolve(document.modelContext.registerTool({ name: 'set_course_targets', title: 'Set target courses', description: 'Replace the selected target set and update the prerequisite map and conditional study plan. Saves the selection in this browser.', inputSchema: { type: 'object', properties: { courseIds: { type: 'array', items: { type: 'string' }, uniqueItems: true } }, required: ['courseIds'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
      if (!input || !Array.isArray(input.courseIds) || Object.keys(input).some(k => k !== 'courseIds') || input.courseIds.some(id => !byId.has(id))) throw new Error('Provide an array of valid catalogue course IDs.');
      targets = new Set(input.courseIds); selected = input.courseIds[0] ?? selected; render(true);
      return { targets: [...targets], prerequisites: [...path.included].filter(id => !targets.has(id)), placed: [...plan.scheduled.keys()], unplaced: plan.unscheduled };
    } }, { signal: lifecycle.signal })).catch(() => { /* Optional API; ordinary controls remain available. */ });
  } catch { /* Browser support is optional. */ }
}

async function init() {
  const response = await fetch('./catalogue.json'); if (!response.ok) throw new Error('The course catalogue could not be loaded.');
  catalogue = await response.json(); courses = catalogue.courses; byId = validateCatalogue(courses);
  restore(); $('total-courses').textContent = courses.length; $('checked-on').textContent = catalogue.checkedOn;
  $('start-year').value = startYear; $('plan-years').value = years; $('capacity').value = capacity; $('projections').checked = projections;
  $('search').addEventListener('input', renderCatalogue); $('track').addEventListener('change', renderCatalogue);
  $('clear').addEventListener('click', () => { targets.clear(); render(true); });
  $('plan-years').addEventListener('change', event => { years = Number(event.target.value); render(); });
  $('start-year').addEventListener('change', event => { startYear = Number(event.target.value); render(); });
  $('capacity').addEventListener('change', event => { capacity = event.target.value === 'unlimited' ? 'unlimited' : Number(event.target.value); render(); });
  $('projections').addEventListener('change', event => { projections = event.target.checked; render(); });
  $('zoom-in').addEventListener('click', () => zoom(1.2)); $('zoom-out').addEventListener('click', () => zoom(1/1.2)); $('fit').addEventListener('click', fit);
  $('export').addEventListener('click', exportPlan);
  let drag;
  const viewport = $('viewport');
  viewport.addEventListener('pointerdown', event => { if (event.target.closest('button') || event.button !== 0) return; drag = { x: event.clientX-view.x, y: event.clientY-view.y }; viewport.setPointerCapture(event.pointerId); viewport.classList.add('dragging'); });
  viewport.addEventListener('pointermove', event => { if (drag) { view.x = event.clientX-drag.x; view.y = event.clientY-drag.y; transform(); } });
  const stopDrag = () => { drag = null; viewport.classList.remove('dragging'); };
  viewport.addEventListener('pointerup', stopDrag); viewport.addEventListener('pointercancel', stopDrag); viewport.addEventListener('lostpointercapture', stopDrag);
  viewport.addEventListener('keydown', event => { if (event.key === 'Escape') stopDrag(); });
  $('nodes').addEventListener('focusin', event => {
    const node = event.target.closest('.node'); if (!node) return;
    const x = parseFloat(node.style.left), y = parseFloat(node.style.top);
    if (view.x+x*view.scale < 0 || view.x+(x+220)*view.scale > viewport.clientWidth || view.y+y*view.scale < 0 || view.y+(y+124)*view.scale > viewport.clientHeight) {
      view.x = viewport.clientWidth/2-(x+110)*view.scale; view.y = viewport.clientHeight/2-(y+62)*view.scale; transform();
    }
  });
  render(true); new ResizeObserver(fit).observe(viewport); registerAgentTools();
}
init().catch(error => { $('error').hidden = false; $('error').textContent = `Unable to open the planner: ${error.message} Please reload, or use the official programme outline above.`; $('path-summary').textContent = 'Catalogue unavailable'; });
