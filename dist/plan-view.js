import { formatOffering, periodInfo } from './calendar.js';

// Shared presentation model: every selected target has a visible outcome,
// including targets with unknown offerings or already met requirements.
export function studyPlanView(plan, targets, completed, startYear) {
  return {
    extended: plan.years > plan.requestedYears,
    semesters: Array.from({ length: plan.years * 2 }, (_, index) => ({
      ...periodInfo(startYear, index * 2),
      index,
      beyondProgramme: index >= 4,
    })),
    targets: [...targets].map(id => {
      const offering = plan.scheduled.get(id);
      if (completed.has(id)) return { id, status: 'completed', label: 'Already studied / requirement met' };
      if (offering) return { id, status: 'scheduled', label: `${formatOffering(startYear, offering)} · ${offering.semesterOnly ? 'Schedule not yet published' : offering.confirmed ? 'Published offering' : 'Provisional offering'}${offering.exceptionalProject ? ' · Semester 3 exception; review required' : ''}${offering.outsideOutline ? ' · Outside programme outline; review required' : ''}` };
      const unplaced = plan.unscheduled.find(item => item.id === id);
      return { id, status: 'unscheduled', label: `Not yet scheduled: ${unplaced?.reason ?? 'Select a prerequisite route to plan this target.'}` };
    }),
  };
}
