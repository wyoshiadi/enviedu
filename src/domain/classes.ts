import type { Condition, StudyClass } from './types.ts';

export const studyClasses = [
  { id: 'A', condition: 'guided', label: 'Class A', activity: 'Guided comparison' },
  { id: 'B', condition: 'separate', label: 'Class B', activity: 'Separate-case reflection' }
] as const satisfies readonly { id: StudyClass; condition: Condition; label: string; activity: string }[];

export function classForCondition(condition: Condition) {
  return studyClasses[condition === 'guided' ? 0 : 1];
}
