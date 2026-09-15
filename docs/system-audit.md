# System audit — 15 September 2026

## Coverage

The requested auditor, updater and critic reviewed all 52 courses and 72 outline entries, prerequisite rules, published offerings, programme placement, credit loads, persistence, import validation and visible plan output. Sources: the [supplied outline](https://www.uu.se/en/study/outline?query=53757e7c-b967-4250-83db-911b32fbdfc8), [programme syllabus](https://www.uu.se/en/study/programme-syllabus?query=6470850a-0697-11f1-a756-4970631443e8), linked course pages and [faculty periods](https://www.uu.se/en/students/faculty/science-and-technology/academic-year-periods-and-exams).

## Corrections

- Targets beyond the selected minimum window now extend the visible timeline automatically. Every target has an explicit scheduled, completed or unplaced status.
- Offering dates and programme-relative semesters are separate constraints. Listed programme semesters are preferred; exploratory placements are flagged.
- Mathematics Degree Project E supports semesters 3 and 4. Its nominal workload is 15 credits per period. Taught courses are placed first so the project can move to semester 4 when needed. The financial project follows its semester-4 outline entry.
- A programme report shows each semester against 30 credits, the first four semesters against 120, project placement, main-field advanced credits and basic-level limits. It does not certify eligibility or degree approval.
- Saved settings are validated field by field without discarding valid target choices. Course-specific calculus alternatives no longer share an overly broad checkbox.
- Catalogue validation rejects malformed URLs, requirements, dates, grids and subject metadata. Failed imports preserve the previous snapshot.

## Verification

- `npm run check`: 46 passing tests, including a durable catalogue-wide sweep of individual targets and their union, source calendar boundaries, rotations, credits, prerequisites, project semesters, outline exceptions and saved-state restoration.
- Critic’s additional 4,240 scenarios covered all courses and their union, start years 2026–2030, all offered credit limits, published/provisional modes and completed-course profiles. No accounting, ordering, capacity or target-visibility failures were found.
- Eight offline Python importer tests pass, including malformed upstream content and atomic snapshot preservation. The stricter parser accepts the checked official outline’s 52 courses and 72 entries.
- The local Chrome accessibility tree confirms the user’s five saved targets and completed prerequisites remain present. Lie Algebras is in spring 2027 P4; the mathematics project is provisionally in autumn 2027. The report shows 75 credits with semester loads 20, 25, 30 and 0, leaving 45 credits to allocate.

## Remaining data and planning limits

Eleven courses lack a verified exact period pattern: `1MA038`, `1MA217`, `1MA336`, `1MA056`, `1MA081`, `1MA181`, `2NE814`, `2NE811`, `1MA344`, `1MA342`, `1MS051`. They remain explicitly unplaced until their periods are known. Semester-only outline entries are not fabricated into exact teaching periods.

Second-year offerings are provisional where unpublished. Later starting years reuse the supplied 2026 outline as a scenario. The deterministic scheduler does not search every alternative arrangement, resolve timetable clashes or establish formal eligibility. Background courses, transfer credits, prior-degree overlap, track variations and project approval need individual review. Optional WebMCP support has not been tested in a supporting browser. Browser evidence covers the loaded saved plan, not a comprehensive manual interaction or responsive visual audit.
