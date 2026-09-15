// Programme-relative semesters describe the supplied outline, independently
// of a course's calendar-year availability. Individual variations need review.
export const programmeSources = {
  outline: 'https://www.uu.se/en/study/outline?query=53757e7c-b967-4250-83db-911b32fbdfc8',
  syllabus: 'https://www.uu.se/en/study/programme-syllabus?query=6470850a-0697-11f1-a756-4970631443e8',
};

export function allowedProgrammeSemesters(course) {
  const entries = course.outline ?? [];
  if (entries.some(entry => /any period during the programm?e?/i.test(entry.group))) return [1, 2, 3, 4];
  return [...new Set(entries.map(entry => entry.semester).filter(semester => Number.isInteger(semester) && semester >= 1 && semester <= 4))].sort((a, b) => a - b);
}

export function programmePlacement(course, offering) {
  const semesters = [...new Set(offering.periods.map(period => Math.floor(period / 2) + 1))].sort((a, b) => a - b);
  const allowedSemesters = allowedProgrammeSemesters(course);
  const outsideProgramme = semesters.some(semester => semester < 1 || semester > 4);
  const supported = semesters.length > 0 && semesters.every(semester => allowedSemesters.includes(semester));
  const reason = supported ? '' : outsideProgramme
    ? 'This placement extends beyond the four-semester programme outline.'
    : `The supplied outline lists this course in semester${allowedSemesters.length === 1 ? '' : 's'} ${allowedSemesters.join(', ') || 'not specified'}, rather than semester${semesters.length === 1 ? '' : 's'} ${semesters.join(', ')}.`;
  return { semesters, allowedSemesters, supported, outsideProgramme, reason };
}

const round = value => Number(value.toFixed(2));
const isBridging = course => course.outline.some(entry => /bridging courses/i.test(entry.group));

// This is an outline/workload assessment, not a degree audit. Already-studied
// markers prove neither transfer credit nor that a course is outside a prior
// Bachelor's degree. They are deliberately excluded from qualification totals.
export function assessProgrammePlan(courses, plan, { completed = new Set(), targets = new Set(), mainField = null } = {}) {
  const byId = new Map(courses.map(course => [course.id, course]));
  const semesters = Array.from({ length: 4 }, (_, index) => ({ semester: index + 1, credits: 0, gap: 30, overload: 0, courseIds: [] }));
  const unsupportedPlacements = [], extendedCourseIds = [], projectIds = [];
  let totalScheduledCredits = 0, outlineSupportedCredits = 0, bridgingCredits = 0;
  let advancedCredits = 0, basicCredits = 0, unknownLevelCredits = 0;
  const mainFieldAdvancedCredits = new Map();
  for (const [id, offering] of plan.scheduled) {
    const course = byId.get(id);
    if (!course) throw new Error(`Unknown scheduled course: ${id}`);
    // A stale scheduled record must not double-count a completed-course marker.
    if (completed.has(id)) continue;
    const placement = programmePlacement(course, offering);
    totalScheduledCredits += course.credits;
    if (!placement.supported) unsupportedPlacements.push({ id, title: course.title, ...placement });
    if (placement.outsideProgramme) extendedCourseIds.push(id);
    let programmeLoad = 0;
    offering.periods.forEach((period, index) => {
      const semester = semesters[Math.floor(period / 2)];
      if (!semester) return;
      const load = offering.loads[index];
      semester.credits += load;
      if (!semester.courseIds.includes(id)) semester.courseIds.push(id);
      programmeLoad += load;
    });
    if (placement.supported) outlineSupportedCredits += programmeLoad;
    if (isBridging(course)) bridgingCredits += programmeLoad;
    const fields = Array.isArray(course.subjectLevels) ? course.subjectLevels : [];
    const advanced = fields.filter(field => /^A\d/.test(field.level));
    if (advanced.length) advancedCredits += programmeLoad;
    else if (fields.some(field => /^G\d/.test(field.level)) || isBridging(course)) basicCredits += programmeLoad;
    else unknownLevelCredits += programmeLoad;
    for (const subject of new Set(advanced.map(field => field.subject))) {
      mainFieldAdvancedCredits.set(subject, (mainFieldAdvancedCredits.get(subject) ?? 0) + programmeLoad);
    }
    if (placement.supported && ['1MA080', '1MA182'].includes(id) && course.credits >= 30) {
      const subject = id === '1MA080' ? 'Mathematics' : 'Financial Mathematics';
      if (!mainField || mainField === subject) projectIds.push(id);
    }
  }
  for (const semester of semesters) {
    semester.credits = round(semester.credits);
    semester.gap = round(Math.max(0, 30 - semester.credits));
    semester.overload = round(Math.max(0, semester.credits - 30));
  }
  const programmeCredits = round(semesters.reduce((sum, semester) => sum + semester.credits, 0));
  const unplacedCourseIds = [...new Set((plan.unscheduled ?? []).map(item => item.id).filter(id => !completed.has(id)))];
  const unscheduledTargetIds = [...targets].filter(id => !completed.has(id) && !plan.scheduled.has(id));
  const degreeProject = { courseIds: projectIds, missing: !projectIds.length, mainField };
  const creditGap = round(Math.max(0, 120 - programmeCredits));
  const creditOverload = round(Math.max(0, programmeCredits - 120));
  const outlineComplete = semesters.every(semester => !semester.gap && !semester.overload) &&
    !unsupportedPlacements.length && !unplacedCourseIds.length && !unscheduledTargetIds.length && !degreeProject.missing;
  const notes = [
    'The selected prerequisite path may cover only part of a 120-credit individual study plan; elective choices are not added automatically.',
    'Semester loads are planned study credits. Degree inclusion, passed results, entry requirements and prior-degree overlap still require review.',
    'The programme syllabus requires at least 60 credits of advanced study in the chosen main field and a 30-credit degree project. Course level and main field must be verified.',
    'Up to 30 basic-level credits may be included if they supply additional competence and were not included in the Bachelor’s degree; bridging courses are not automatically approved degree credits.',
    'The tracks are proposed and flexible. Placements outside the supplied outline need an individually reviewed study plan.',
  ];
  return {
    semesters, totalScheduledCredits: round(totalScheduledCredits), programmeCredits,
    outlineSupportedCredits: round(outlineSupportedCredits), creditGap, creditOverload,
    unsupportedPlacements, extendedCourseIds, unplacedCourseIds, unscheduledTargetIds,
    bridgingCredits: round(bridgingCredits), advancedCredits: round(advancedCredits),
    basicCredits: round(basicCredits), basicCreditOverload: round(Math.max(0, basicCredits - 30)),
    unknownLevelCredits: round(unknownLevelCredits),
    mainFieldAdvancedCredits: Object.fromEntries([...mainFieldAdvancedCredits].map(([subject, credits]) => [subject, round(credits)])),
    degreeProject, targetPathIncomplete: Boolean(unplacedCourseIds.length || unscheduledTargetIds.length),
    partialPlan: !outlineComplete, outlineComplete,
    degreeStatus: 'requires-review', notes, sources: programmeSources,
  };
}
