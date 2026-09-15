// Science & Technology period dates, checked against Uppsala on 2026-09-15.
export const periodSource = 'https://www.uu.se/en/students/faculty/science-and-technology/academic-year-periods-and-exams';
export const semesterSource = 'https://www.uu.se/en/study/higher-education-in-sweden';
const knownPeriods = {
  2025: [['2025-09-01','2025-11-02'],['2025-11-03','2026-01-18'],['2026-01-19','2026-03-22'],['2026-03-23','2026-06-07']],
  2026: [['2026-08-31','2026-11-01'],['2026-11-02','2027-01-17'],['2027-01-18','2027-03-21'],['2027-03-22','2027-06-06']],
};
const knownSemesters = {
  2026: [['2026-08-31','2027-01-17'],['2027-01-18','2027-06-06']],
  2027: [['2027-08-30','2028-01-16'],['2028-01-17','2028-06-04']],
};
const dayMs = 86400000;
const iso = date => date.toISOString().slice(0,10);
export function semesterDates(year) {
  if (knownSemesters[year]) return knownSemesters[year];
  // Uppsala's published rule: autumn starts on the Monday Aug 28–Sep 3;
  // each semester is 20 weeks. No within-semester period boundaries inferred.
  const first = new Date(Date.UTC(year,7,28));
  first.setUTCDate(first.getUTCDate() + (8-first.getUTCDay())%7);
  return [[iso(first),iso(new Date(+first+139*dayMs))],[iso(new Date(+first+140*dayMs)),iso(new Date(+first+279*dayMs))]];
}
export function periodInfo(startYear, index) {
  const academicYear = startYear + Math.floor(index/4), period = index%4+1;
  const spring = period >= 3, year = academicYear + Number(spring);
  const bounds = knownPeriods[academicYear]?.[period-1];
  return { academicYear, period, semester: Math.floor(index/2)+1, year,
    term: spring ? 'Spring' : 'Autumn', start: bounds?.[0] ?? null, end: bounds?.[1] ?? null,
    semesterDates: semesterDates(academicYear)[Number(spring)],
    semesterDatesPublished: Boolean(knownSemesters[academicYear]) };
}
export function formatPeriods(startYear, indices) {
  const terms = new Map();
  for (const index of indices) {
    const p = periodInfo(startYear,index), key = `${p.term} ${p.year}`;
    if (!terms.has(key)) terms.set(key, []);
    terms.get(key).push(`P${p.period}`);
  }
  return [...terms].map(([term,periods]) => `${term} · ${periods.join(' + ')}`).join('; ');
}
export function periodsForDates({ start, end }) {
  const result = [];
  let coveredDays = 0;
  for (let year = Number(start.slice(0,4))-1; year <= Number(end.slice(0,4)); year++) {
    const periods = knownPeriods[year];
    if (periods) {
      periods.forEach(([first,last],i) => {
        const overlapStart = start > first ? start : first, overlapEnd = end < last ? end : last;
        if (overlapStart <= overlapEnd) {
          const days = Math.round((Date.parse(overlapEnd)-Date.parse(overlapStart))/dayMs)+1;
          coveredDays += days;
          result.push({ academicYear: year, period: i+1, days });
        }
      });
    } else {
      // A full published semester spans both periods even if the faculty has
      // not yet published their boundary. Shorter offerings remain unmapped.
      semesterDates(year).forEach(([first,last],semester) => {
        if (start === first && end === last) {
          coveredDays += Math.round((Date.parse(last)-Date.parse(first))/dayMs)+1;
          for (let half=0;half<2;half++) result.push({ academicYear: year, period: semester*2+half+1, days: null });
        }
      });
    }
  }
  // Never silently truncate a summer course or a range with unknown boundaries.
  return coveredDays === Math.round((Date.parse(end)-Date.parse(start))/dayMs)+1 ? result : [];
}
