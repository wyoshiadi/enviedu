# Research data dictionary

Protocol **pilot-draft-5-class-journeys-en**, language **en**, app **0.4.4**. All CSVs include participant_id, session_id, class_id, condition, protocol_version, instrument_language, app_version, and engine_version. `class_id` is derived from the fixed mapping: A = guided comparison (`guided`); B = separate-case reflection (`separate`). No new database column is needed; existing session conditions remain unchanged.

New activity stages: Class A records `comparison` with items `stocks`, `flows`, `relationship`, `policy` (minimum 60 seconds). Class B records `waste-reflection` with `waste-observation`, `waste-policy`, then `flood-reflection` with `flood-observation`, `flood-policy` (minimum 30 seconds each). Stage entry/completion events preserve each duration separately. Both journeys have 26 responses in a complete session. Collection-v4 sessions retain `reflection`, their original configuration/storage key, and protocol/app versions; exports must not mix these interventions without accounting for protocol version.

| Export | Main columns/content |
| --- | --- |
| responses.csv | stage, item_id, value, submitted_at_utc |
| events.csv | seq, at_utc, elapsed_ms, stage, event_type, payload_json |
| timeseries.csv | scenario/version/run, timestamp, parameters, time, stock, inflow, capacity, actual outflow, units |
| scores.csv | objective score, maximum, items answered, blank manual_explanation_score, instrument status, completion flag |
| session.json | Session, browser timezone, protocol/scenario snapshots, responses, logs, and series |

Teacher-only combined responses/scores CSVs use the current dashboard filters across participants. Individual downloads provide all five formats. Combined exports are bounded to 500 sessions and 8 MiB of stored session data.

Response values retain instrument codes. The dashboard resolves choice codes into readable labels beside their questions. CSV uses decimal points, commas, quoted cells, and a UTF-8 BOM. Formula-like strings receive an apostrophe prefix; negative numeric values remain numeric.

## Central records

| Database field | Meaning |
| --- | --- |
| id / participant_code | Server-assigned session UUID / anonymous participant code |
| condition / protocol_version | Fixed condition for the selected class and immutable protocol identity |
| created_at | Server session creation time |
| updated_at | Server receipt of the latest accepted checkpoint |
| submitted_at | Server receipt of final completion; null until final |
| stage / responses_count / runs_count | Last accepted progress |
| pre_score / post_score / transfer_score | Draft objective scores calculated on the server |
| session_json | Latest accepted complete checkpoint |
| last_sequence / content_hash | Ordering and duplicate-upload handling |
| token_hash / expires_at | Hashed private upload capability and its expiry; excluded from teacher responses and exports |

Device response/run/event timestamps are retained in research exports. They differ from server receipt metadata in the dashboard/API; they do not establish authentic elapsed time. The upload capability lasts seven days. Unfinished submissions with `stage <> 'complete'`, `submitted_at IS NULL`, and server `updated_at` at least one hour old are permanently deleted. Accepted new checkpoints renew the idle window; duplicate uploads and device timestamps do not. Completed submissions are excluded from automatic deletion regardless of age.

The Cloudflare scheduled handler runs every five minutes. Teacher GET requests (after authorization) and valid new registrations also purge eligible sessions before reading or allocating records. An expired student upload is rejected with HTTP 410 and cannot revive a deleted session. Dashboard counts, class aggregates, selection, and exports therefore contain only remaining sessions. Automatically removed partial sessions are absent from later research exports; this policy affects the availability of incomplete-session and attrition data.

The database also contains rate-limit buckets. The legacy `study_settings` table is retained for compatibility; its global condition no longer controls registration. `/api/teacher/settings` returns the two fixed classes; updates are rejected. Runtime teacher identity is configured separately as a secret. Browser working progress and local/hosted databases are separate; old browser-only data is not automatically uploaded or relabelled.

The teacher can select sessions in the dashboard and permanently delete up to 500 at once. `GET /api/teacher/submissions/selection` returns only IDs and participant codes for the current filters across pages; `DELETE /api/teacher/submissions` accepts explicit, unique selected IDs. Both require the configured teacher identity; deletion also requires a same-origin JSON request. The deletion batch is atomic, removes each complete submission row, and revokes that session's upload access. New registrations after the selection snapshot are unaffected, even when a participant code is reused. Dashboard aggregates and exports reflect the remaining rows. Saved browser progress and previously downloaded exports are separate copies and remain after database deletion.

## Interpretation

Pre/post each have three closed-response items (0–3) and one explanation. Familiarity is unscored. Transfer has four closed-response items (0–4) and one explanation. Manual explanation scores remain blank, not zero. Instruments are **draft-not-validated**. Use items_answered and session_complete to distinguish incomplete data from wrong responses.

Events include session_started, session_resumed, stage_entered, stage_completed, responses_submitted, parameter_changed, parameters_reset, simulation_run, and visibility_changed. Elapsed_ms includes closed-browser and inactive-tab time; visibility does not measure attention. Historical versions may contain session_imported events.

Visual events scene_playback_started, scene_playback_paused, scene_playback_completed, and scene_time_selected include scenarioId, runId, index, time, stock, source, and visualizationVersion. Automatic playback does not emit a user event for every frame.

Students cannot read records or scores through the API. Teachers authenticate for every list, detail, setting, and download request. Session validation checks version/configuration, completed stages, parameters, run IDs, and deterministic replay. These checks do not identify a participant or prevent repeated participation.
