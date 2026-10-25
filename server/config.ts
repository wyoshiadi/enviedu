import scenarioJSON from '../src/config/scenarios.json' with { type: 'json' };
import protocolJSON from '../src/config/study.json' with { type: 'json' };
import assessmentJSON from '../src/config/assessments.json' with { type: 'json' };
import { predictionFields, revisionFields, reflectionFields } from '../src/domain/prompts.ts';
import type { Assessment, Field, Protocol, Scenario, Session, Stage } from '../src/domain/types.ts';
export const scenarios = scenarioJSON as Scenario[];
export const protocol = protocolJSON as Protocol;
export const assessments = assessmentJSON as Record<string, Assessment>;
export function fieldsFor(stage: Stage, condition: Session['condition']): Field[] {
  if (assessments[stage]) return assessments[stage].fields;
  if (stage === 'reflection' || stage === 'comparison' || stage.endsWith('-reflection')) return reflectionFields(condition, stage);
  if (stage.endsWith('-predict')) return predictionFields(scenarios.find(s => stage.startsWith(s.id))!);
  if (stage.endsWith('-revise')) return revisionFields;
  return [];
}
