import scenarioJSON from './config/scenarios.json';
import protocolJSON from './config/study.json';
import assessmentJSON from './config/assessments.json';
import type { Assessment, Protocol, Scenario } from './domain/types.ts';
export const scenarios = scenarioJSON as Scenario[];
export const protocol = protocolJSON as Protocol;
export const assessments = assessmentJSON as Record<'pretest' | 'posttest' | 'transfer', Assessment>;
export { predictionFields, revisionFields, reflectionFields } from './domain/prompts.ts';
export const stageLabels: Record<string, string> = { pretest: 'Initial understanding', 'waste-predict': 'Waste · Predict', 'waste-experiment': 'Waste · Experiment', 'waste-revise': 'Waste · Revise', 'flood-predict': 'Flooding · Predict', 'flood-experiment': 'Flooding · Experiment', 'flood-revise': 'Flooding · Revise', reflection: 'Reflection', comparison: 'Compare & generalize', 'waste-reflection': 'Waste · Reflect', 'flood-reflection': 'Flooding · Reflect', posttest: 'Final understanding', transfer: 'A new context', complete: 'Complete' };
