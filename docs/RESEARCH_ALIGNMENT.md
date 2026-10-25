# Alignment with the Research Master Notes

Source: the user's working concept, *A Reusable Web-Based Simulation Platform to Support Transfer of Systems Thinking Across Environmental Contexts*. Software implementation does not approve provisional research choices.

| Requirement | Implementation | Status |
| --- | --- | --- |
| Deterministic stock–flow calculation | domain/engine.ts | Balance, timing, and bounds tested |
| Shared waste/flooding engine | config/scenarios.json | Numerical scale differs by 10×; units differ |
| Prediction → experiment → revision | App.tsx and domain/study.ts | Initial run and two configurations required |
| Guided comparison | `comparison` stage; domain/prompts.ts | Both cases together, four cross-context prompts, mapping diagrams/table; 60-second minimum |
| Separate-case reflection | `waste-reflection` → `flood-reflection` | Two pages, one case and two case-specific prompts each; 30-second minimum per page; no structural comparison |
| Comparable experience | Shared simulations/assessments; condition-specific journeys | Four prompts and 60-second total minimum in each condition; total time/load not matched |
| Carbon transfer task | config/assessments.json | After post-test, without a practice simulator |
| Carbon familiarity | First pre-test item | Self-report requiring evaluation |
| Pre/post/transfer measures | JSON instruments | Draft, unvalidated |
| Participant code and condition | Student enters teacher-provided ID and assigned class; server fixes A = guided, B = separate | Both classes available together; manual assignment, not randomized |
| Actions, predictions, revisions, tests | Central records and exports | Device event times plus server receipt metadata |
| Reproducibility | Snapshots, engine version, lockfile, migrations | Freeze the build before study use |
| Cross-participant collection | Worker API and D1 | One teacher; protected dashboard and exports |
| Anonymous student workflow | Public create/upload endpoints | No result-reading API or student downloads |
| English delivery | Interfaces, instruments, docs | Protocol pilot-draft-5-class-journeys-en; collection-v4 sessions remain on their original protocol |
| ANCOVA/regression/effects/CI | Not implemented | Requires agreed design and data |
| Delayed assessment/interviews | Not implemented | Optional in the notes |

Provisional choices include waste before flooding, two distinct configurations, four reflection prompts, a 60-second reflection minimum, and mapping diagrams only in condition A. Open explanations require human scoring. Shared stock illustrations may affect learning and belong in the reviewed intervention package.

The platform does not establish literature gaps, originality relative to Green et al. (2022), or effectiveness. Bibliographic claims in the notes require verification before preparing final research instruments.
