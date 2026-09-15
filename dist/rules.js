// Manually reviewed against each course's linked entry requirements, 2026-09-15.
// A group requires ONE option. Separate groups are AND requirements.
// `parallel` is used only where concurrent study is explicitly allowed.
// Credit totals, degrees, English, equivalence and project approval remain in
// catalogue.json's official requirements and require individual review.
const c = id => ({ course: id });
const x = label => ({ external: label });
const group = (kind, ...options) => ({ kind, options: options.map(o => typeof o === 'string' ? c(o) : o) });
const p = (...options) => group('participation', ...options);
const r = (...options) => group('completed', ...options);
const parallel = (...options) => group('parallel', ...options);
const la = x('Linear Algebra II');
const calc = x('Several Variable Calculus');
const calcM = x('Several Variable Calculus M');
const calcLimited = x('Several Variable Calculus, Limited Version');

export const rules = {
  '1MS369': [p(x('Regression Analysis'))],
  '1MA148': [p(la), p(calc, calcM), p(x('Ordinary Differential Equations I'), x('Transform Methods'))],
  '1MA215': [p('1MA362')],
  '1MS041': [parallel(calcLimited)],
  '1MA216': [p('1MA362'), parallel('1MA215')],
  '1MS045': [r('1MS036')],
  '1TD354': [r(x('Scientific Computing II'), x('Introduction to Scientific Computing'), x('Scientific Computing, Bridging Course')), r(calc), r(la)],
  '1MS370': [p(x('Regression Analysis'))],
  '2NE831': [],
  '1MA209': [r(calc, calcLimited, calcM, x('Geometry and Analysis II')), r(x('Probability and Statistics'), x('Mathematical statistics KF'))],
  '1MA259': [p('1MA362')],
  '1MA036': [p('1MA007', x('Mathematical Methods of Physics II')), p(x('Linear Algebra III'), x('Quantum Physics'))],
  '1MA007': [r(la), parallel(x('Basic Ring Theory'), x('Introduction to specialization mathematical physics'))],
  '1MA362': [p(la), p(calc, x('Calculus in Several Variables'), calcM)],
  '1MS036': [p(x('Probability Theory I'), x('Probability and Statistics')), p(calc, calcM, calcLimited), p(la)],
  '1MA531': [p('1MA362'), p(x('Complex Analysis'))],
  '1MS049': [p('1MS041', '1MA209', x('Regression Analysis'))],
  '1MA196': [r('1MA362', x('Equivalent to Real Analysis'))],
  '1MS052': [r(x('Regression Analysis'))],
  '1MA038': [p('1MA362'), p(x('Complex Analysis'))],
  '1MA217': [p('1MA362')],
  '1RT700': [r(x('Probability and Statistics')), r(la), r(x('Single Variable Calculus')), r(x('Introductory programming'))],
  '1TD062': [],
  '1MS012': [r(x('Probability Theory I'))],
  '1MS900': [p('1MS041', x('Both Inference Theory II AND Regression Analysis'))],
  '1MS048': [p('1MS041'), p(x('Linear Algebra for Data Science'), la)],
  '1MA331': [r(la), p('1MA362')],
  '1MA256': [r(x('Scientific Computing KF'), x('Introduction to Scientific Computing'))],
  '1MS050': [parallel('1MS048')],
  '1MS014': [p(x('Inference Theory I'), x('Probability and Statistics'))],
  '1MA053': [r(calc, calcM, x('Geometry and Analysis III')), r(la), p(x('Transform Methods'), x('Fourier Analysis'))],
  '1MA255': [r('1MA209'), p('1MS036', '1MA215')],
  '1MA333': [r(la), p('1MA007'), p('1MA259')],
  '1MA338': [p('1MA216')],
  '1MA325': [p('1MA036')],
  '1MS030': [p('1MA215'), p('1MS036')],
  '1MA332': [group('participation', '1MA036'), r(la)],
  '1MA336': [p('1MA259'), p('1MA036')],
  '1MA056': [p('1MA007', x('Symmetry and Group Theory in Physics')), p(x('Linear Algebra III'), x('Quantum Physics'))],
  '1MA337': [], '1MA081': [], '1MA181': [], '1MA080': [],
  '1TD186': [r(x('Scientific Computing II'), x('Scientific Computing, Bridging Course'), x('Introduction to Scientific Computing'))],
  '1RT001': [r(x('Probability and Statistics')), r(x('Linear Algebra')), r(x('Single Variable Calculus')), r(x('Introductory programming'))],
  '2NE814': [], '2NE811': [],
  '1TD056': [p('1TD354', x('Scientific Computing III'))],
  '1MA344': [], '1MA342': [],
  '1MS051': [r('1MS036', x('Equivalent to Probability Theory II')), r(x('Inference Theory II or equivalent'))],
  '1MA182': [],
};

export const ruleNotes = {
  '1MA259': 'Basic Topology is recommended, not a formal prerequisite.',
  '1MA332': 'The entry requirement says “Modules and homological algebra taken”; represented as prior participation, not a passed-course requirement.',
  '1MS050': 'The entry requirement calls the prerequisite “Foundations in Data Science”; mapped to Foundations of Data Science (1MS048) in this outline.',
  '1MA007': 'Concurrent study is explicitly permitted for the ring-theory / mathematical-physics requirement.',
};
