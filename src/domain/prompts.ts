import type { Field, Scenario, Session, Stage } from './types.ts';
export function predictionFields(scenario: Scenario): Field[] {
  return [
    { id: 'direction', type: 'choice', prompt: `Under the given initial conditions, what happens to ${scenario.stockLabel.toLowerCase()} after ${scenario.inflowLabel.toLowerCase()} is reduced?`, options: [{ value: 'rise', label: 'It keeps increasing' }, { value: 'steady', label: 'It stays constant' }, { value: 'fall', label: 'It decreases' }] },
    { id: 'reason', type: 'text', prompt: 'Explain your prediction before trying the simulation.' }
  ];
}
export const revisionFields: Field[] = [
  { id: 'direction', type: 'choice', prompt: 'In the initial run, after inflow decreased, the stock…', options: [{ value: 'rise', label: 'Kept increasing' }, { value: 'steady', label: 'Stayed constant' }, { value: 'fall', label: 'Decreased' }] },
  { id: 'reason', type: 'text', prompt: 'Compare the initial run with your prediction. How do inflow and outflow explain the change in stock? If your explanation changed, describe what changed.' }
];
export function reflectionFields(condition: Session['condition'], stage: Stage = 'reflection'): Field[] {
  const guided = [
    ['stocks', 'Compare the two cases: what accumulates in the waste system and in the urban water system?'],
    ['flows', 'Match the inflows and outflows across the two cases. How are their roles similar?'],
    ['relationship', 'Why can the stock in both initial runs keep increasing even when inflow decreases? State the general relationship between stock, inflow, and outflow.'],
    ['policy', 'What general condition makes the stock decrease in both cases? Explain one policy for each case.']
  ];
  const separate = [
    ['waste-observation', 'For the waste case, describe the pattern in the amount of waste before and after incoming waste was reduced.'],
    ['waste-policy', 'For the waste case, explain the results of your parameter changes and a policy you consider useful.'],
    ['flood-observation', 'For the urban water case, describe the pattern in water volume before and after runoff was reduced.'],
    ['flood-policy', 'For the urban water case, explain the results of your parameter changes and a policy you consider useful.']
  ];
  const prompts = condition === 'guided' ? guided : separate;
  return prompts.filter(([id]) => stage === 'waste-reflection' ? id.startsWith('waste-') : stage === 'flood-reflection' ? id.startsWith('flood-') : true).map(([id, prompt]) => ({ id, prompt, type: 'text' }));
}
