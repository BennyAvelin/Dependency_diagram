# Course data and planning semantics

## Snapshot and coverage

The dataset contains all 52 unique course codes in the supplied TMA2M outline. Repeated appearances in different tracks/semesters are preserved in each course’s `outline` records. Prerequisites are reviewed separately in `rules.js`, rather than guessed from descriptions or course titles.

`catalogue.json` retains each course’s title, code, credits, track/semester appearances, explicit per-period credit allocation, rotation notes, published date ranges, entry requirements, source URL, syllabus URL and check date.

The official sources remain authoritative. The snapshot reflects the 2026 entry cohort. Choosing a later starting year explores the same outline as a scenario; it does not switch to a later programme revision.

## Requirement model

Each course has zero or more requirement groups. All groups are required; **one option within each group** is required. An option refers either to another catalogue course or to an external background requirement.

| Kind | Interpretation | Scheduler treatment |
| --- | --- | --- |
| `completed` | The source lists the course as an entry requirement, without relaxing it to participation | Prerequisite must finish earlier |
| `participation` | The source explicitly requires participation, or says the course was taken | Prior course is placed before the dependent course; no pass requirement is inferred |
| `parallel` | Concurrent study is explicitly permitted | Prerequisite may start in the same or an earlier period |

The map shows the selected prerequisite route. Alternative options remain available in course details; unchosen alternatives are not silently added to the workload. A completed alternative is preferred only if the student has not explicitly chosen an option.

Marking a course already studied is a student assertion that its role in the path is satisfied. The app does not have transcripts, grades or a separate attendance record. It stops expanding that course’s own prerequisites and excludes it from the scheduled workload.

### Specific source interpretations

- Partial Differential Equations (1MA216) explicitly permits Integration Theory (1MA215) in parallel. Real Analysis remains a prior participation condition.
- Topics in Data Science (1MS050) refers to “Foundations in Data Science”; this is mapped to Foundations of Data Science (1MS048) in the outline. Parallel study is explicitly allowed.
- Lie Algebras (1MA332) says Modules and Homological Algebra was “taken”; this is represented as prior participation. The original wording remains visible.
- Bayesian Statistics permits Introduction to Data Science **or both** Inference Theory II and Regression Analysis. The latter is one compound external option, not two independent alternatives.
- Basic Topology is recommended for Differential Topology, so it is a note rather than a required edge.
- External subject variants such as several-variable calculus are grouped under a readable label; the exact accepted alternatives remain in each official requirement. Marking a shared background label is a planning note and does not establish equivalence for every course.

General eligibility conditions are not reduced to course edges. Required total credits, credits in subjects, degrees, English, equivalent learning and departmental project approval remain in the full entry text and require review. There is no automatic eligibility or degree-completion badge.

## Teaching periods

P1 and P2 belong to autumn; P3 and P4 belong to the following spring. Internal timeline indices 0–7 cover the default two academic years; an extended plan can cover three or four years. A course spanning periods contributes its per-period credits to each occupied period without counting its total credits twice.

Published course date ranges establish actual offerings. `calendar.js` holds the official Science and Technology period boundaries for 2025/26 and 2026/27. Date ranges map by overlap, rather than fixed January/March/November day cutoffs. Course details, timeline labels and downloads share the same calendar. The outline’s credit split is used when it matches the offered periods and course credit total. Otherwise the workload is estimated in proportion to overlapping days (or evenly for a full semester with no published internal boundary). Financial Theory ends on 3 November 2026 and therefore extends two days into faculty P2; the previous version incorrectly dropped those days. Its estimated 7.5-credit split is 7.27 in P1 and 0.23 in P2, not an official credit allocation.

If the course page lists an additional offering that is absent from the outline grid, it is retained. For example, Statistical Machine Learning has both autumn P2 and spring P3 offerings in the checked snapshot.

Future projection is enabled by default so the plan can cover later years even before applications open. A published-only mode remains available. Future offerings reuse explicit outline period patterns and all previous published patterns, including courses with multiple offerings per year or no outline period grid. Each repeat is labelled provisional. Explicit odd/even-year rules apply to the **calendar year of the teaching semester**, so spring 2027 is odd even though it belongs to academic year 2026/27. Courses without a rotation note are assumed to repeat annually only in projection mode. Courses specified only by semester remain unplaced when no exact offering/period pattern is available.

Known offerings for a term take precedence over projection for that term. Every future projection is labelled provisional. Known semester dates for 2027/28 include spring starting on 17 January 2028; this is P3, not the preceding autumn. Faculty boundaries within those future semesters have not yet been published and are not invented. Beyond the published semester dates, dates are calculated from Uppsala’s official 20-week-semester rule and labelled calculated. Summer and partially unmappable date ranges are never silently clipped to known periods. The snapshot’s preliminary 2027/28 outline is not presented as a confirmed timetable.

## Scheduling

The scheduler orders the selected dependency graph from prerequisites to targets, then tries offerings in chronological order. It enforces the selected credit ceiling independently for each period. Participation and completion requirements need an earlier finishing period; explicit parallel requirements need an earlier or equal starting period.

This is a deterministic greedy suggestion, not a search over every feasible plan. It does not optimise shared OR choices, revise earlier placements to make later ones fit, check dates within a period, resolve university timetable clashes or allocate unknown background courses. An unplaced course gives a reason, lists known offerings in the window, and (when its prerequisites are placed) checks two additional years for the next feasible offering. The student can extend the visible window up to four years; the app does not silently move an odd-year course into an even year.

Named background requirements can be checked by the student, but they are not assigned invented dates. Course placement stays conditional on those studies and all remaining formal entry requirements. The interface always retains the review section and does not equate zero unchecked background items with admission eligibility.

## Maintenance

Run the importer explicitly; there is no unattended data refresh. It downloads the outline and linked course pages, follows the current syllabus link where a course has no offering, and writes an atomic catalogue snapshot. It neither edits nor infers the reviewed rule groups.

For each refresh, compare the source text and dates against the dependency model and date-to-period mapping. Revise tests for actual changes. Investigate missing requirements or unknown course IDs rather than silently treating them as no prerequisites. Check whether a newer outline supersedes the supplied 2026 revision before extending to another cohort.


## Period audit and Lie Algebras regression

Checked against the [faculty calendar](https://www.uu.se/en/students/faculty/science-and-technology/academic-year-periods-and-exams), [semester dates](https://www.uu.se/en/study/higher-education-in-sweden) and the supplied programme outline on 2026-09-15:

| Academic year | Period | Dates |
| --- | --- | --- |
| 2026/27 | P1 | 31 August–1 November 2026 |
| 2026/27 | P2 | 2 November 2026–17 January 2027 |
| 2026/27 | P3 | 18 January–21 March 2027 |
| 2026/27 | P4 | 22 March–6 June 2027 |

[Lie Algebras](https://www.uu.se/en/study/course?query=1MA332) has published dates 22 March–6 June 2027. The outline specifies P4 in odd years. With Algebraic Structures already met, Modules and Homological Algebra can be placed in autumn 2026 and Lie Algebras in spring 2027 P4. With Algebraic Structures first taken in autumn 2026, the conservative prerequisite order instead places Modules in autumn 2027 and the next provisional Lie Algebras offering in spring 2029 P4. It cannot fit that route into two academic years. External prerequisites and formal eligibility still need review.

The test suite checks every dated catalogue offering against the calendar, January boundaries, repeat patterns, odd/even rotations and both Lie Algebras scenarios. Existing v1 saved plans keep their targets, completed courses and alternative choices while adopting future planning; subsequent mode choices are explicitly versioned and preserved.
