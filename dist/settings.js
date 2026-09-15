export const planningVersion = 2;

// v1 silently saved the old published-only default. Upgrade that default,
// retaining the student's targets, history and choices in app.js. Once the
// mode has a version, always preserve an explicit published-only selection.
export function includeFutureOfferings(saved) {
  return saved?.planningVersion >= planningVersion && typeof saved.projections === 'boolean'
    ? saved.projections : true;
}
