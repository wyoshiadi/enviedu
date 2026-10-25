# Roadmap aligned with the Research Master Notes

## Implemented

| Version | Implementation |
| --- | --- |
| v0.1 | Waste model, parameters, accumulation graph |
| v0.2 | Predictions, experiments, revisions, saved responses |
| v0.3 | Flooding using the shared engine and interface |
| v0.4 | Two conditions, pre/post/transfer, logs, exports |
| v0.4.1 | English instruments, interface, docs, language metadata |
| v0.4.2 | Illustrated scenes, playback, graph cursors, interaction logs |
| v0.4.3 | Anonymous student collection, D1 backend, one teacher account, protected dashboard and combined exports |

These are software milestones. A participant pilot has not yet taken place.

## Installation and operation

Node.js 24+, npm, and Git support local development. Run npm.cmd ci and npm.cmd run dev from enviedu. Node includes SQLite; hosted use provisions D1 through Sites. No separate database server or AI API is required. The local teacher sign-in is a loopback-only development simulation; hosted access uses the configured owner's ChatGPT account.

## Supervisor review

1. Confirm the construct: transfer of stock–flow reasoning.
2. Review waste, flooding, and simplified carbon model boundaries.
3. Examine carbon novelty; self-report alone cannot establish it.
4. Review condition A/B, mapping diagrams, English wording, timing, and cognitive load.
5. Decide allocation design. The current server applies a teacher-selected condition to new sessions without randomization.
6. Finalize consent, anonymous participant-code handling, retention, and debrief arrangements.

## v0.5 — participant pilot

- Conduct cognitive interviews, readability/usability checks, and content review.
- Validate items and pre/post comparability.
- Calibrate explanation scoring with two raters and examine agreement.
- Review missing data, interruptions, duration, experiments, and intervention fidelity.
- Test hosted student-to-teacher collection in the intended classroom network.
- Revise and version instruments/models following findings.

## v1.0 — main study

- Conduct power analysis; the 60–100 estimate in the notes is not an approved final sample size.
- Finalize outcomes, baseline adjustment, familiarity, missing-data handling, effects, and confidence intervals.
- Complete institutional ethics and consent requirements.
- Agree controlled allocation and monitoring; anonymous sessions do not prevent repeat participation.
- Establish backup, retention/deletion, and audit procedures appropriate to the study.
- Freeze commit, dependencies, database migrations, protocol, language, and instruments.
- Collect and analyze data under the approved design.

Multi-teacher roles, student accounts, AI tutors, multiplayer, 3D, and visual scenario authoring remain outside the current scope.
