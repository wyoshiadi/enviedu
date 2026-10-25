# Draft pilot protocol — not approved or validated

Main question: does guided structural comparison improve transfer of stock–flow reasoning to a carbon problem compared with separate-case reflection, accounting for baseline understanding?

Shared procedure: teacher provides a participant ID and assigned class → student enters the ID and selects Class A or Class B without login → server assigns the fixed condition → pre-test/familiarity → waste prediction/experiments/revision → flooding prediction/experiments/revision.

Then the journeys branch as specified in sections 5 and 6.2 of *Research_Proposal_Reusable_Simulation_Platform.docx*:

- **Class A / guided:** `comparison` (Compare & generalize). Both cases appear together, with initial-run evidence, revised explanations, stock–flow mapping diagrams and a role table. Four prompts ask students to compare stocks/flows, explain a shared relationship, and generalize a policy condition. Minimum 60 seconds.
- **Class B / separate:** `waste-reflection` → `flood-reflection`. Each page shows only one case with its initial-run evidence and revised explanation. Two case-specific prompts per page ask about observations and policies; there is no mapping or cross-case comparison instruction. Minimum 30 seconds per page.

Both return to the shared post-test → carbon transfer → server-confirmed submission receipt. The carbon assessment has no simulator or learning feedback. The shared landing page does not introduce a shared stock–flow rule or ask students to discover connections.

Each simulation requires two distinct configurations. Both conditions have four reflection/comparison prompts and a total minimum period of 60 seconds. Total duration and cognitive load are not matched by this alone. Protocol **pilot-draft-5-class-journeys-en**, app **0.4.4**, records these distinct journeys; item wording, scoring, and models remain stable. Collection-v4 sessions retain their original sequence and protocol rather than being relabelled.

The teacher signs in with the configured account (ChatGPT on Sites; teacher email through Access on standalone Cloudflare) to review both classes, read answers, and export records by class. Students select the class assigned by their teacher; its condition is fixed by the server. They do not see scores, receive an answer-key debrief, or download research data. Existing sessions retain their condition. Assignment remains manual, not randomized, and the app does not verify class membership against a roster.

Server checks enforce condition-specific completed-stage consistency, minimum activity durations in the event history, deterministic replay, ownership of uploads, and immutable final submissions. The browser implements the reflection timer; device timestamps and anonymous participation are not independent evidence of authentic timing or identity. Finalize allocation, monitoring, consent, retention, and debrief procedures before participant use.

Operational retention: unfinished sessions are permanently removed after one hour without a newly accepted checkpoint, using server receipt time. This is an inactivity policy, not a one-hour total learning limit. Completed submissions are kept. A five-minute Cloudflare cleanup schedule and cleanup before teacher reads/new registration remove expired rows; late uploads cannot restore them. Expired participants may start again using a fresh session. Removed partial sessions are no longer available for process/attrition analysis, and this operational policy should be recorded with the study build.

## Draft transfer-explanation rubric

| Score | Proposed criterion |
| --- | --- |
| 0 | Irrelevant explanation, or assumes lower emissions necessarily mean falling stock |
| 1 | Mentions emissions/uptake without relating their difference to stock change |
| 2 | Explains the emissions–uptake difference; lower emissions need not lower the stock |
| 3 | Meets level 2 and states emissions must be below uptake while stock remains available, within the model boundaries |

Blank responses are missing; agree on handling before analysis. No keyword scoring is used. Develop anchor examples, train two raters, and examine agreement. The rubric remains unvalidated.

## Open decisions

- Carbon novelty, item validity, pre/post comparability, and rehearsal effects.
- Randomized or quasi-experimental design, allocation, power analysis, and sample size.
- Mapping diagrams in condition A, prompt length, timing, and cognitive load.
- Primary outcome, baseline/familiarity covariates, missing data, effects, and confidence intervals.
- Delayed assessment/interviews, institutional ethics/consent, and teacher-mediated debrief.
- Review of English wording and record-retention procedures before participant use.

Both conditions use the same stock-responsive waste/water scenes after prediction and simulation. Their fixed visual reference is not a physical storage limit or flood-depth calculation. Review the representation as part of the intervention package.

Record decisions with date, version/commit, supervisor feedback, rationale, analytical consequences, and next actions. Freeze the protocol and build before the main study.
