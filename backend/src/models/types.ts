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
  
  // Execution tracking
  progressPercentage?: number; // 0 to 100
  actualStartDate?: number;
  actualEndDate?: number;
  actualCost?: number;
}

export interface ProjectInput {
  name: string;
  totalDurationUsable: number;
  totalBudget: number;
  timeUnit: TimeUnit;
  steps: StepInput[];
  isBaselineFrozen?: boolean;
}

export interface StepSchedule extends StepInput {
  // Baseline (Planned)
  startDate: number;
  endDate: number;
  
  // projected/tracking
  projectedStartDate: number;
  projectedEndDate: number;
  
  // CPM (Critical Path Method)
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  isCritical: boolean;
  
  // Intelligent badges
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Delayed' | 'Over Budget' | 'On Track';
}

export interface CashFlowPeriod {
  period: number;
  
  plannedPeriodCost: number;
  plannedAccumulatedCost: number;
  plannedAccumulatedPercentage: number;
  
  actualPeriodCost: number;
  actualAccumulatedCost: number;
  actualAccumulatedPercentage: number;
}

export interface ProjectScheduleResult {
  projectName: string;
  projectStartDate: number;
  projectEndDate: number;
  projectedEndDate: number;
  totalPlannedCost: number;
  totalActualCost: number;
  steps: StepSchedule[];
  cashFlow: CashFlowPeriod[];
}
