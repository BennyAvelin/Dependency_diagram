import { makePlan } from './planner.js';

// Preview a move without changing the saved choices or losing placed courses.
export function previewSemesterMove(courses, path, completed, settings, currentPlan, id, semester) {
  if (!currentPlan.scheduled.has(id) || !Number.isInteger(semester) || semester < 1 || semester > currentPlan.years * 2) {
    return { allowed: false, reason: 'Choose a course and a semester in the displayed plan.' };
  }
  const semesterChoices = { ...settings.semesterChoices, [id]: semester };
  const candidate = makePlan(courses, path, completed, { ...settings, semesterChoices });
  const blocked = candidate.unscheduled.find(item => item.id === id)
    ?? candidate.unscheduled.find(item => currentPlan.scheduled.has(item.id));
  if (blocked) {
    const course = courses.find(course => course.id === blocked.id);
    return { allowed: false, reason: `${course.title}: ${blocked.reason}` };
  }
  return { allowed: true, semesterChoices, offering: candidate.scheduled.get(id) };
}
