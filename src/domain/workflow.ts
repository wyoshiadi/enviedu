import legacyJSON from '../config/study-legacy.json' with { type: 'json' };
import type { Condition, Protocol, Stage } from './types.ts';

// Keep already collected sessions on their original sequence and configuration.
export const legacyProtocol = legacyJSON as Protocol;

export function protocolForVersion(version: string, current: Protocol): Protocol {
  if (version === current.version) return current;
  if (version === legacyProtocol.version) return legacyProtocol;
  throw new Error('The session version does not match this prototype.');
}

export function stagesFor(protocol: Protocol, condition: Condition): Stage[] {
  return protocol.stagesByCondition?.[condition] ?? protocol.stages;
}

export function reflectionMinimumSeconds(protocol: Protocol, stage: Stage): number {
  if (stage === 'reflection' || stage === 'comparison') return protocol.reflectionMinimumSeconds;
  if (stage === 'waste-reflection') return Math.ceil(protocol.reflectionMinimumSeconds / 2);
  if (stage === 'flood-reflection') return Math.floor(protocol.reflectionMinimumSeconds / 2);
  return 0;
}
