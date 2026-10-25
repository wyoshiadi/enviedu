export type Condition = 'guided' | 'separate';
export type StudyClass = 'A' | 'B';
export type ScenarioId = 'waste' | 'flood';
export type Stage = 'pretest' | 'waste-predict' | 'waste-experiment' | 'waste-revise' | 'flood-predict' | 'flood-experiment' | 'flood-revise' | 'reflection' | 'comparison' | 'waste-reflection' | 'flood-reflection' | 'posttest' | 'transfer' | 'complete';
export type Parameters = { initialStock: number; inflow: number; outflow: number; inflowAfter: number; policyAt: number };
export type ParameterKey = keyof Parameters;
export type Scenario = {
  id: ScenarioId; version: string; title: string; shortTitle: string; theme: string;
  context: string; stockLabel: string; inflowLabel: string; outflowLabel: string;
  stockUnit: string; timeUnit: string; flowUnit: string; duration: number; dt: number;
  engine: 'single-stock'; defaults: Parameters;
  bounds: Record<ParameterKey, { min: number; max: number; step: number }>;
  assumptions: string[];
  visualization: { version: string; referenceStock: number };
};
export type Point = { time: number; stock: number; inflow: number; capacity: number; actualOutflow: number };
export type Run = { id: string; scenario: ScenarioId; scenarioVersion: string; engineVersion: string; at: string; parameters: Parameters; series: Point[] };
export type Field = { id: string; prompt: string; type: 'choice' | 'text' | 'number'; options?: { value: string; label: string }[]; hint?: string };
export type Assessment = { title: string; introduction: string; fields: Field[] };
export type Protocol = { id: string; version: string; appVersion: string; language: 'en'; title: string; reflectionMinimumSeconds: number; minimumDistinctRuns: number; stages: Stage[]; stagesByCondition?: Partial<Record<Condition, Stage[]>>; conditionLabels: Record<Condition, string> };
export type StudyEvent = { seq: number; at: string; elapsedMs: number; stage: Stage; type: string; payload: Record<string, unknown> };
export type Response = { stage: Stage; itemId: string; value: string; at: string };
export type Session = {
  schemaVersion: 1; sessionId: string; participantId: string; condition: Condition;
  protocolVersion: string; appVersion: string; engineVersion: string;
  createdAt: string; updatedAt: string; completedAt: string | null; timezone: string;
  stage: Stage; parameters: Record<ScenarioId, Parameters>; responses: Response[]; runs: Run[]; events: StudyEvent[];
  configuration: { protocol: Protocol; scenarios: Scenario[] };
};
