export type TimeUnit = 'days' | 'months';

export interface Dependency {
  stepId: string;
  type: 'FS';
}

export interface StepInput {
  id: string;
  name: string;
  duration: number;
  cost: number;
  dependencies: Dependency[];
}

export interface ProjectInput {
  name: string;
  totalDurationUsable: number;
  totalBudget: number;
  timeUnit: TimeUnit;
  steps: StepInput[];
}

export interface StepSchedule extends StepInput {
  startDate: number;
  endDate: number;
}

export interface CashFlowPeriod {
  period: number;
  periodCost: number;
  accumulatedCost: number;
  accumulatedPercentage: number;
}

export interface ProjectScheduleResult {
  projectName: string;
  projectStartDate: number;
  projectEndDate: number;
  totalCost: number;
  steps: StepSchedule[];
  cashFlow: CashFlowPeriod[];
}
