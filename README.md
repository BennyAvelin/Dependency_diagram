# Course Atlas — Uppsala Mathematics

An interactive prerequisite map and individual study planner for **Uppsala University’s Master’s Programme in Mathematics (TMA2M)**. The catalogue covers all **52 unique courses** linked from the outline valid from Autumn 2026, including the three tracks, alternatives, bridging courses and degree projects.

## Use the planner

1. Add one or more **target courses** using `+` in the catalogue. Search by title/code or filter by track.
2. Select a course in the map or catalogue to inspect its requirements and official sources.
3. Mark courses **already studied / requirement met** to stop expanding their prerequisites. Only mark a course when your prior study meets its role in the path; a completed-course condition still requires a pass.
4. Choose a route for requirements with alternatives. Only the chosen route enters the graph. If no choice has been made, a completed alternative is preferred, otherwise the first option is used.
5. Review the four-semester plan. Change the starting academic year or credit limit. **Projected future offerings are off by default** and are visibly distinguished from published offerings when enabled.
6. Review background studies and full entry conditions below the timeline. Download a JSON plan for your records.

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

This checks JavaScript syntax and runs the Node test suite. GitHub Actions runs the same checks on pushes and pull requests. Tests cover catalogue validation, cycles, shared prerequisite closures, alternatives, completed courses, parallel study, confirmed versus projected offerings, odd/even-year rules, unknown periods and period credit limits.

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
- The planner places courses greedily in an earliest available period subject to dependencies and the selected credit limit. It is not an optimiser and does not establish that an unplaced course is impossible to schedule.
- Future projection reuses explicit outline periods and year rotations. It is a scenario assumption, not a promise that a course will run. No exact period is invented for a course listed only by semester.
- Credit loads describe work in the selected path, including any bridging courses. They are **not** eligible degree-credit totals. Additional course choices may be needed for the 120-credit programme.
- Timetable clashes, admission capacity and special permissions are not checked.

## Hosting and privacy

The GitHub repository is private. The private Sites preview is owner-only and is separate from repository access. Students cannot use that private preview unless access is deliberately changed later.

No credentials belong in the repository. The application has no analytics, external fonts, application backend or account system. Uppsala source pages are opened only when a user follows a source link.

The app optionally registers a `set_course_targets` WebMCP tool when the browser supports `document.modelContext`. It uses the same target state as the visible controls and validates all IDs before mutation. No supported live WebMCP validation context was available during setup, so this optional integration has not been verified in a supporting browser. Browser interaction and visual QA have not been run; verification covered the planning engine, source data, syntax and static serving.
