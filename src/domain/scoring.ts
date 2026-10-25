import type { Session } from './types.ts';
// Draft answer key: deliberately never used to give feedback before completion.
const keys: Record<string, Record<string, string | number>> = {
  pretest: { stock: 'stock', change: 'rise', balance: 30 },
  posttest: { stock: 'backlog', change: 'fall', balance: 45 },
  transfer: { stock: 'amount', change: 'rise', balance: 110, policy: 'less-than' }
};
export function objectiveScores(session: Session) {
  return Object.entries(keys).map(([stage, key]) => {
    let score = 0, answered = 0;
    for (const [id, expected] of Object.entries(key)) {
      const response = session.responses.find(r => r.stage === stage && r.itemId === id);
      if (response) { answered++; if (typeof expected === 'number' ? Math.abs(Number(response.value) - expected) < 1e-8 : response.value === expected) score++; }
    }
    return { stage, objectiveScore: score, maximum: Object.keys(key).length, answered, manualExplanationScore: null };
  });
}
