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
- External background labels preserve course-specific alternatives. A limited calculus alternative is not treated as satisfying a full calculus sequence. Only identical requirement labels share a checkbox; the exact official entry wording remains visible.

General eligibility conditions are not reduced to course edges. Required total credits, credits in subjects, degrees, English, equivalent learning and departmental project approval remain in the full entry text and require review. There is no automatic eligibility or degree-completion badge.

## Teaching periods

P1 and P2 belong to autumn; P3 and P4 belong to the following spring. Internal timeline indices 0–7 cover the default two academic years; the timeline automatically extends to show later valid placements, searching up to eight academic years. The selected two-, three- or four-year window remains a minimum and is saved separately from the effective displayed horizon. A course spanning periods contributes its per-period credits to each occupied period without counting its total credits twice.

Published course date ranges establish actual offerings. `calendar.js` holds the official Science and Technology period boundaries for 2025/26 and 2026/27. Date ranges map by overlap, rather than fixed January/March/November day cutoffs. Course details, timeline labels and downloads share the same calendar. The outline’s credit split is used when it matches the offered periods and course credit total. Otherwise a full-semester course is estimated with an equal split between its two periods, so a 30-credit project contributes 15 credits per period. This is a nominal workload estimate, not a claim of an official credit allocation. Other date ranges are estimated in proportion to overlapping days. Financial Theory ends on 3 November 2026 and therefore extends two days into faculty P2; the previous version incorrectly dropped those days. Its estimated 7.5-credit split is 7.27 in P1 and 0.23 in P2, not an official credit allocation.

If the course page lists an additional offering that is absent from the outline grid, it is retained. For example, Statistical Machine Learning has both autumn P2 and spring P3 offerings in the checked snapshot.

Future projection is enabled by default so the plan can cover later years even before applications open. A published-only mode remains available. Future offerings reuse explicit outline period patterns and all previous published patterns, including courses with multiple offerings per year or no outline period grid. Each repeat is labelled provisional. Explicit odd/even-year rules apply to the **calendar year of the teaching semester**, so spring 2027 is odd even though it belongs to academic year 2026/27. Courses without a rotation note are assumed to repeat annually only in projection mode. When no period pattern is available, an explicit fall/autumn/spring semester note supports a provisional semester reservation, including its odd/even-year rule. A semester heading alone does not infer an offering.

Known offerings for a term take precedence over projection for that term. Every future projection is labelled provisional. Known semester dates for 2027/28 include spring starting on 17 January 2028; this is P3, not the preceding autumn. Faculty boundaries within those future semesters have not yet been published and are not invented. Beyond the published semester dates, dates are calculated from Uppsala’s official 20-week-semester rule and labelled calculated. Summer and partially unmappable date ranges are never silently clipped to known periods. The snapshot’s preliminary 2027/28 outline is not presented as a confirmed timetable.

The 30-credit Degree Project E in Mathematics (`1MA080`) is explicitly listed in programme semesters 3 and 4. For this project, the planner offers provisional whole-semester autumn and spring placements with estimated 15 + 15 credits, defaulting to semester 4 relative to the selected programme start. Semester 3 is used only when the student explicitly selects that exceptional placement; automatic scheduling never falls back to semester 3. The financial mathematics project (`1MA182`) is listed only in semester 4, so its provisional pattern remains spring and its earliest placement is semester 4. A published date from an earlier cohort remains a published offering but is not a suitable earlier project placement in this programme plan. These reviewed project patterns do not infer periods for other semester-only courses. Advanced-credit and approved-project entry requirements remain subject to review.

## Scheduling

The scheduler orders the selected dependency graph from prerequisites to targets and places full-semester degree projects after ordinary taught-course paths. It first tries offerings in the course’s listed programme semesters, with any-period courses allowed in semesters 1–4. If no feasible outline placement exists, it retains an exploratory later or different-semester placement and explicitly marks it outside the programme outline; a visible target is not a claim that the programme plan is complete. It enforces the selected credit ceiling independently for each period. Participation and completion requirements need an earlier finishing period; explicit parallel requirements need an earlier or equal starting period.

This is a deterministic greedy suggestion, not a search over every feasible plan. It does not optimise shared OR choices, revise earlier placements to make later ones fit, check dates within a period, resolve university timetable clashes or allocate unknown background courses. The scheduler searches up to eight academic years, then trims trailing empty years while retaining the student’s chosen minimum window. This automatically displays later targets without moving an odd-year course into an even year. Every selected target has a visible status above the timeline, including already studied targets and targets that remain unplaced. Unplaced courses give a reason and list offerings checked across the full search window; unknown or capacity-blocked courses do not cause eight empty years to be displayed. If a feasible offering lies beyond the search limit, its date is reported. Semesters beyond the standard two-year programme are explicitly labelled. Downloads retain both the requested minimum and effective displayed years.

Students can pin a course to a semester using `semesterChoices` in browser settings and plan downloads. Choices retain programme-relative semester numbers when the start year changes. The scheduler requires every occupied period to be in that selected semester and still checks offering mode, prerequisite order and capacity. A conflicting choice stays visible and unplaced; it is never silently ignored. Controls enumerate known/provisional offering semesters, label outline deviations and retain a saved choice that is unavailable after a mode change. Choosing Automatic removes the constraint. As with automatic planning, the greedy scheduler does not rearrange every other course to satisfy a pin.

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

[Lie Algebras](https://www.uu.se/en/study/course?query=1MA332) has published dates 22 March–6 June 2027. The outline specifies P4 in odd years. With Algebraic Structures already met, Modules and Homological Algebra can be placed in autumn 2026 and Lie Algebras in spring 2027 P4. With Algebraic Structures first taken in autumn 2026, the conservative prerequisite order instead places Modules in autumn 2027 and the next provisional Lie Algebras offering in spring 2029 P4. The timeline automatically includes the third academic year for that route and labels it as beyond the standard programme. External prerequisites and formal eligibility still need review.

The test suite checks every dated catalogue offering against the calendar, January boundaries, repeat patterns, odd/even rotations and both Lie Algebras scenarios. Existing v1 saved plans keep their targets, completed courses and alternative choices while adopting future planning; subsequent mode choices are explicitly versioned and preserved.

## Programme outline assessment

The outline controls programme-relative placement separately from offering dates. `programme.js` expands explicit any-period entries to semesters 1–4 and reports placements outside the listed semesters. Its report checks 30 credits per semester, 120 planned credits in the first four semesters, a supported 30-credit project, unplaced paths and extensions. `subjectLevels` retains the official main-field classifications; multi-field courses count once toward total study load. Advanced credits are shown by main field against the programme’s 60-credit requirement, which includes the project. Basic-level credits above 30 are flagged; even within that limit, additional competence and prior-degree overlap need review. Completed prerequisite markers are excluded from degree totals because transfer and prior-degree use are unknown.

A complete semester layout is not degree approval. The tracks are flexible proposals, so the report does not require every course listed in a track or silently add electives. JSON downloads include the same programme assessment shown in the interface.

## Outline text without published periods

Analytic Number Theory and Dynamical Systems explicitly state autumn in odd years; Algebraic Topology and Representation Theory for Finite Groups state spring in even years. With projected offerings enabled, these notes generate `semesterOnly` reservations. Analytic Number Theory can therefore occupy semester 3 (autumn 2027) for a 2026 start. Published dates and known period grids retain priority.

The interface renders each reservation once at semester level with **Schedule not yet published**, without claiming P1/P2 or P3/P4 teaching. Internally, two half-semester slots reserve an estimated equal credit load and conservatively bound prerequisite order to the whole semester. The period-load totals are marked estimated; this allocation does not prove the final timetable or workload will fit. The export marks these as `semesterOnly`, marks period records `estimatedReservation`, omits their exact start/end dates and retains the explanatory load basis. Semester choices, dependencies, outline deviations and published-only mode still apply.

## Workload conflicts and unlimited capacity

A selected semester now reports its actual blocker: missing offering, programme stage, prerequisite timing or credit limit. Capacity conflicts include the occupied courses and the existing + requested load for each affected period, also retained as structured `conflicts` in plan downloads.

The Credits per period control supports `unlimited`, stored as that literal string so it survives JSON storage and export. This bypasses only the scheduling load ceiling. Actual credit totals remain finite and visible; programme 30-credit semester checks, offering mode, rotations, explicit semester choices, project stage and prerequisite ordering remain active. Switching to a finite limit recalculates the plan and restores capacity restrictions. Automatic course placements may change when the limit changes.
