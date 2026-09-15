# Course Atlas — Uppsala Mathematics

An interactive prerequisite map and individual study planner for **Uppsala University’s Master’s Programme in Mathematics (TMA2M)**. The catalogue covers all **52 unique courses** linked from the outline valid from Autumn 2026, including the three tracks, alternatives, bridging courses and degree projects.

## Use the planner

1. Add one or more **target courses** using `+` in the catalogue. Search by title/code or filter by track.
2. Select a course in the map or catalogue to inspect its requirements and official sources.
3. Mark courses **already studied / requirement met** to stop expanding their prerequisites. Only mark a course when your prior study meets its role in the path; a completed-course condition still requires a pass.
4. Choose a route for requirements with alternatives. Only the chosen route enters the graph. If no choice has been made, a completed alternative is preferred, otherwise the first option is used.
5. Review the study plan. Choose **Unlimited** under Credits per period to remove the scheduling workload cap; the programme report still flags semesters above 30 credits. Change the starting academic year, credit limit or minimum plan window (2–4 academic years). **Provisional future offerings are included by default** and shown with dashed cards. Turn them off to restrict the view to published offerings. The timeline automatically extends when a prerequisite chain or rotation needs more years, searching up to eight academic years. Added semesters are labelled as beyond the standard two-year programme. Every target has a visible placement, completed status or explanation above the timeline; click a placed target to jump to its course card.
6. Use **Choose semesters for your courses** above the timeline, or **Take this course in** in course details, to select a semester. Choices are saved and included in downloads. The degree project defaults to **semester 4**; choosing semester 3 for Mathematics is an explicit exception to review with the programme adviser. If a selected semester conflicts with offerings, prerequisites or the credit limit, the course stays visibly unplaced until you adjust the plan. Choose **Automatic** to clear a selection.
7. Check programme fit above the timeline: each semester should total 30 credits, the four-semester programme 120 credits, and the degree project must occupy an allowed semester. Placements outside the outline and missing credits are flagged. Already-studied prerequisite markers are not automatically counted as degree credits.
8. Review background studies and full entry conditions below the timeline. Download a JSON plan for your records.

Selections are saved in this browser’s local storage. Nothing is sent to a backend. Downloaded plans are records; importing them is not currently supported.

## Run locally

Requirements: Node.js 22 or later for checks and npm scripts; Python 3 for the local HTTP server.

```sh
npm run dev
```

Open <http://127.0.0.1:5173>. There are no application dependencies and no build step. All authored public files are in `dist/`, which is intentionally tracked. Serve that directory with any static HTTP host; opening `index.html` through `file://` will not work because the app loads the catalogue with `fetch`.

```sh
npm run check
```

This checks JavaScript syntax and runs the Node test suite. GitHub Actions runs these checks and the offline Python importer tests on pushes and pull requests. Tests cover catalogue validation, cycles, shared prerequisite closures, alternatives, completed courses, parallel study, confirmed versus projected offerings, odd/even-year rules, unknown periods and period credit limits.

## Source data

- [Programme outline, valid from Autumn 2026](https://www.uu.se/en/study/outline?query=53757e7c-b967-4250-83db-911b32fbdfc8), checked 2026-09-15.
- Each course links to its official course page and syllabus in `dist/catalogue.json`.
- Course pages supply dated offerings and entry requirements. Where no offering is listed, the latest linked syllabus supplies the entry requirements.
- The outline supplies per-period credit loads, tracks and rotation notes. Its second-year outline for **2027/2028 is preliminary**.

See [data methodology](docs/data-methodology.md) for how requirements and periods are represented and which decisions need individual review.

## Structure

| File | Purpose |
| --- | --- |
| `dist/index.html`, `dist/styles.css` | Responsive interface and styling |
| `dist/app.js` | Targets, map, details, browser storage and plan export |
| `dist/catalogue.json` | Official course facts and source links |
| `dist/rules.js` | Reviewed prerequisite groups and interpretation notes |
| `dist/planner.js` | Dependency closure and conditional scheduling |
| `dist/programme.js` | Programme-semester placement and workload/subject-credit assessment |
| `dist/plan-view.js` | Effective timeline and explicit target placement statuses |
| `dist/calendar.js` | Official faculty calendar and shared timeline/period labels |
| `dist/settings.js` | Planning mode defaults and saved-plan migration |
| `scripts/import_catalogue.py` | Maintainer-only official data refresh |
| `test/planner.test.js` | Data and scheduling tests |
| `.openai/hosting.json` | Private Sites deployment configuration |

## Update the catalogue

The browser uses the checked-in snapshot; it does not scrape Uppsala’s website during a student session.

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/import_catalogue.py
```

Review the resulting diff against the official pages. Update **both** the prerequisite rules and tests when requirements change. The importer deliberately does not infer dependencies from course titles. Check all date-to-period assignments, revised offerings, changed names, rotations, credit loads and the outline revision before committing. A successful download alone is not a reviewed release.

## Planning limits

This is an independent planning aid, not a university admissions or degree assessment.

- The graph expands programme and bridging courses. Named studies outside that catalogue appear as background requirements with a checklist, rather than fabricated courses or dates.
- Credit totals, subject distributions, degree requirements, English proficiency, equivalence and approved degree-project plans require individual review. Full official entry wording is retained for each course.
- Prior participation is scheduled before the dependent course. Concurrent placement is permitted only when explicitly stated. A “participation” edge does not mean that passing is required.
- The planner first seeks a placement in the course’s listed programme semesters, subject to dependencies and the selected credit limit. Full-semester degree projects are placed after taught courses; Mathematics Degree Project E defaults to semester 4; semester 3 requires an explicit exceptional choice. If only an exploratory placement outside the outline fits, it is explicitly flagged. It is not an optimiser and does not establish that an unplaced course is impossible to schedule.
- Future projection reuses explicit outline periods, previous published offering patterns and year rotations. It is a scenario assumption, not a promise that a course will run. An explicit autumn/spring note can reserve a semester, respecting odd/even-year rules. These courses appear once under **Schedule not yet published**, with exact periods unknown and an estimated equal workload split for capacity checks. Courses without a usable offering or explicit term note remain unplaced.
- Credit loads describe work in the selected path, including any bridging courses. They are **not** eligible degree-credit totals. Additional course choices may be needed for the 120-credit programme.
- Timetable clashes, admission capacity and special permissions are not checked.

## Hosting and privacy

The GitHub repository is private. The private Sites preview is owner-only and is separate from repository access. Students cannot use that private preview unless access is deliberately changed later.

No credentials belong in the repository. The application has no analytics, external fonts, application backend or account system. Uppsala source pages are opened only when a user follows a source link.

The app optionally registers a `set_course_targets` WebMCP tool when the browser supports `document.modelContext`. It uses the same target state as the visible controls and validates all IDs before mutation. No supported live WebMCP validation context was available during setup, so this optional integration has not been verified in a supporting browser. The local browser was checked with the user’s saved five-target selection, including visible Lie Algebras and degree-project placements and the programme credit report. See [system audit](docs/system-audit.md) for coverage and remaining limits.
