# enviedu — Environmental Education Platform

Research prototype **v0.4.4**, based on *A Reusable Web-Based Simulation Platform to Support Transfer of Systems Thinking Across Environmental Contexts*. All interfaces and instruments are in English. The blue and indigo theme uses Material-inspired color roles.

## Students and teacher

- **Students:** open `/`, enter the participant ID provided by the teacher, choose their assigned **Class A** or **Class B**, select **Start learning**, and complete the activities. No account or password is required. Class A always receives guided comparison; Class B always receives separate-case reflection.
- **One teacher:** open `/teacher` and sign in. Sites hosting uses the configured owner's ChatGPT account; standalone Cloudflare hosting uses the configured teacher email through Access. The Cloudflare teacher routes are protected, the Worker is configured, and the owner has confirmed successful sign-in.
- Answers and progress save to a central database. Students receive only a submission receipt after server confirmation; they cannot view results, scores, other students' work, or research downloads.
- Unfinished sessions expire after **one hour without a newly accepted checkpoint**, measured by server receipt time. Completed submissions are retained. Cloudflare runs cleanup every five minutes; teacher reads and new registrations also remove eligible expired sessions immediately.
- The teacher dashboard shows progress, answers beside their questions, draft objective scores, filters, CSV/JSON downloads, and participant selection with bulk deletion. It refreshes every 15 seconds while visible; **Refresh results** updates it immediately.

Cloudflare platform: https://enviedu.com. Student collection is deployed and verified; teacher routes use Cloudflare Access with the matching Worker configuration. The owner has confirmed successful teacher sign-in.

Previous Sites platform: https://enviedu.decentibex3.chatgpt.site. Its records have not been transferred to the new Cloudflare database.

The teacher provides anonymous participant IDs using 3–32 letters, numbers, hyphens, or underscores. Students must enter their ID before starting; the server stores that exact ID after trimming surrounding spaces and does not generate a replacement. An ID can be used for only one session. Existing progress resumes in the same browser; if an ID is already in use elsewhere, ask the teacher for help. The app has no student roster or identity matching. Free-text answers should not contain names or personal identifiers.

## Run locally

Use **Node.js 24 or later**, npm, and Git. Node.js 24.22.1 is installed here. SQLite is included with Node; a separate database installation is unnecessary.

```powershell
cd D:\Research\Environmental-Learning\enviedu
$env:PATH = 'C:\Program Files\nodejs;C:\Program Files\Git\cmd;' + $env:PATH
npm.cmd ci
npm.cmd run dev
```

Open http://127.0.0.1:4173 for students, or http://127.0.0.1:4173/teacher for the dashboard. This machine's PowerShell policy blocks npm.ps1, so use npm.cmd.

**Local development sign-in is simulated:** select **Continue as local teacher**. The loopback-only Node adapter strips client-supplied identity headers and is excluded from the hosted Worker. Hosted teacher access uses real ChatGPT sign-in. Do not expose the local adapter as a public server.

Local records live in `.local/enviedu.sqlite`; committed migrations apply at startup. Hosted records live in Cloudflare D1, so the teacher can review hosted student submissions from another device. These databases are separate. Old browser-only sessions are not automatically imported.

## Teacher workflow

1. Open `/teacher` and sign in using the configured owner account.
2. Review the two class cards: **Class A · Guided comparison** and **Class B · Separate case**. Each shows started, completed, and in-progress sessions. Both classes can work at the same time; the mapping is fixed. Allocation is not randomized.
3. Share the platform's root URL and each student's assigned class and participant ID. Students select that class before starting. Existing sessions retain their condition and resume without selecting again.
4. Select a class card or filter **Student results** by participant code, progress, or class.
5. Select **View answers**. Written explanations require teacher assessment.
6. Use **Download all answers · CSV** or **Download all scores · CSV** for the current filters.
7. Individual records also provide **Answers CSV**, **Scores CSV**, **Activity CSV**, **Simulation CSV**, and **Session JSON**.
8. Select participant checkboxes or **Select all on this page**. For more than one page, **Select all N matching sessions** selects the current filtered results across pages. Selections persist across pages and clear when search, class, or status filters change. Select at most 500 sessions per deletion.
9. Choose **Delete selected data**, review the participant IDs and count, then confirm or cancel. Confirming permanently removes the selected sessions, including answers, scores, and simulation history; dashboard totals and exports update accordingly. New arrivals after selection are preserved. Export first if records must be retained.

Deleting a session frees its participant code for a new registration and revokes its old upload capability. Saved progress on student devices remains; clear that site's saved browser data before starting again. Deletion does not reset other participants, class settings, or authentication.

CSV exports include `class_id` (A/B) alongside `condition` (guided/separate), and combined downloads use the current class filter. Combined exports are bounded to 500 sessions and 8 MiB of stored session data. Narrow the filters for larger collections. Sign out when finished. There are no student accounts or multi-teacher roles.

## Learning workflow

Both classes: pre-test and carbon familiarity → waste prediction/experiment/revision → flooding prediction/experiment/revision. The next activities differ:

- **Class A:** Compare & generalize (`comparison`), with both cases, their initial-run charts and revised explanations, mapping diagrams/table, and four cross-context prompts; **60 seconds** minimum.
- **Class B:** Waste reflection (`waste-reflection`) → Flooding reflection (`flood-reflection`), on separate pages with only the current case, its initial-run chart and revised explanation, and two prompts per case; **30 seconds** minimum per page. No structural comparison activity is shown.

Both then complete post-test → carbon transfer → submission receipt. Sidebar stages, progress totals, teacher answer sections, and exports follow the condition-specific sequence. The shared landing page avoids comparison/generalization cues.

Each experiment requires two distinct parameter configurations. Both conditions have four activity prompts and **60 seconds** total minimum reflection/comparison time. This does not equalize total learning time or cognitive load. Carbon is an assessment context with no practice simulator. Students receive no assessment scores or answer-key debrief.

Waste piles and urban water illustrations follow calculated stock, synchronized with graphs, playback, and a time slider. Fixed visual references are 100 t and 1,000 m³; graphics saturate above these references while numeric values remain available. These references are not physical capacity limits or flood-depth predictions. Reduced-motion preferences disable automatic playback.

## Architecture and access

- React + TypeScript + Vite student interface; `/teacher` loads a separate dashboard.
- `server/api.ts`: authorized collection, teacher reads/exports, assignment, validation, and server-side scoring.
- `server/schema.ts` and `drizzle/`: versioned D1 schema and generated migrations.
- `worker/index.ts`: Sites Worker entry, built to `dist/server/index.js`; `worker/cloudflare.ts`: standalone Cloudflare entry with verified Access JWTs, built to `build/cloudflare/server/index.js`. Each package embeds its frontend assets.
- `scripts/dev-server.mjs`: local Node/SQLite adapter.
- `src/config/`: reusable scenarios, protocol, and draft assessments.
- `src/domain/engine.ts`: deterministic single-stock model.
- `src/domain/study.ts`: progression, responses, logging, and replay validation.
- `src/domain/scoring.ts` and `export.ts`: server-only answer keys and exports; the build rejects imports into browser chunks.

Each teacher API checks an identity supplied by the server adapter against the runtime **TEACHER_EMAIL** secret. The Sites entry obtains identity from its trusted gateway; the standalone entry verifies Cloudflare Access JWTs and ignores Sites identity headers. Configure the email in runtime settings or Wrangler secrets, never in client code or the hosting manifest. Student APIs only create a session and accept its checkpoints using an HttpOnly upload cookie; there is no student record-reading API. Same-origin checks, request bounds, rate limits, stage validation, deterministic replay, and immutable final submissions are enforced on the server.

Browser storage uses the enviedu namespace. Matching sessions saved under the previous brand are restored automatically, retaining the original copy and protocol. Browser storage retains the student's current working progress on the same browser and origin. Keep that browser open while working. The upload cookie lasts seven days, while unfinished server sessions are deleted after one hour of inactivity. The same participant ID can register again after expiry. A server response of HTTP 410 stops old uploads and offers **Start a new session**; restarting clears only that session's saved copies, including legacy namespaces. A connection failure displays an unsaved status with retry; a local copy alone does not mean the teacher received it. Duplicate uploads do not extend retention.

## Build and verification

For deployment to your own Cloudflare account, see the [step-by-step Workers and D1 guide (Indonesian)](docs/CLOUDFLARE_WORKERS.md). Standalone authentication and a Wrangler template are prepared. `npm.cmd run cf:dry-run` checks the standalone package without an account; `npm.cmd run cf:deploy` requires your configured `wrangler.jsonc` and Cloudflare authentication. `npm.cmd run build` produces the Sites package; `npm.cmd run build:cloudflare` produces the standalone package.

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Preview serves the built Worker through the local adapter. With a local server running, use `node tests/browser-smoke.mjs`; set **ENVIEDU_TEST_URL** for a different port and **CHROME_PATH** if needed. Browser checks use synthetic data and isolated student/teacher contexts, wait for the real reflection period in both conditions, and verify central collection, access restrictions, mobile layouts, downloads, and logout. Artifacts stay in ignored `.artifacts/`.

`npm.cmd run test:teacher-delete` tests row/page/all-matching selection, filter changes, cancellation, failed-request recovery, exact deletion, new arrivals, footer removal, desktop/mobile layouts, and restarting an expired session using synthetic sessions. It accepts only a loopback **ENVIEDU_TEST_URL**; use an isolated local database for this test, never production. Unit/API tests advance a mock clock to check the exact one-hour boundary, active checkpoints, duplicate retries, scheduled cleanup, and preservation of completed submissions.

When a schema change is needed, edit `server/schema.ts`, run `npm.cmd run db:generate`, and commit the new migration. Never edit an already deployed migration. Sites applies committed migrations at deployment. Requests do not create tables. The manifest declares the **DB** D1 binding.

## Versions and research status

Protocol **pilot-draft-5-class-journeys-en**, app **0.4.4**, language **en** distinguish the class-specific activity sequences. Simulation models, prediction/revision and assessment wording, reflection item wording, and scoring rules are unchanged. Collection-v4 sessions continue on their original single-reflection sequence, storage key, configuration, and export versions; they are not migrated into the new intervention.

This is a prototype for review and pilot testing. Instruments and explanation rubrics remain unvalidated. Response/event timestamps use the device clock; server creation, checkpoint receipt, and final receipt times are separate database metadata. Anonymous collection does not prevent repeat participation or establish research validity. Freeze the version and finalize the design before main-study collection.

- [Research alignment](docs/RESEARCH_ALIGNMENT.md)
- [Model boundaries](docs/MODEL.md)
- [Draft protocol and rubric](docs/RESEARCH_PROTOCOL.md)
- [Data dictionary](docs/DATA_DICTIONARY.md)
- [Roadmap](docs/ROADMAP.md)

## Public source configuration

This repository includes source code and example deployment configuration. Local Cloudflare account configuration, authentication, databases, and research exports are excluded. The Sites manifest in `.openai/hosting.json` uses `YOUR_SITES_PROJECT_ID`; replace it with your own project ID for Sites hosting. Standalone Cloudflare builds use `npm run build:cloudflare` and your local `wrangler.jsonc` as described in `docs/CLOUDFLARE_WORKERS.md`.
