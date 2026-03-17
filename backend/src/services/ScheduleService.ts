import { ProjectInput, ProjectScheduleResult, StepInput, StepSchedule, CashFlowPeriod } from '../models/types';

export class ScheduleService {
  
  public calculateSchedule(project: ProjectInput): ProjectScheduleResult {
    const stepsMap = new Map<string, StepInput>();
    project.steps.forEach(step => stepsMap.set(step.id, step));

    // 1. Resolve Execution Order (Topological Sort)
    const sortedSteps = this.topologicalSort(project.steps);

    const scheduleMap = new Map<string, StepSchedule>();
    let projectEndDate = 0;
    let totalCost = 0;

    // 2. Calculate Start and End Dates based on 'Finish-to-Start'
    for (const step of sortedSteps) {
      let startDate = 0;

      if (step.dependencies && step.dependencies.length > 0) {
        step.dependencies.forEach(dep => {
          const parentSchedule = scheduleMap.get(dep.stepId);
          if (parentSchedule && parentSchedule.endDate > startDate) {
            startDate = parentSchedule.endDate; // Starts after latest dependencies ends
          }
        });
      }

      const endDate = startDate + step.duration;
      
      const scheduledStep: StepSchedule = {
        ...step,
        startDate,
        endDate
      };

      scheduleMap.set(step.id, scheduledStep);
      projectEndDate = Math.max(projectEndDate, endDate);
      totalCost += Number(step.cost);
    }

    // 3. Compute Cash Flow (S-Curve)
    const cashFlow: CashFlowPeriod[] = [];
    let accumulatedCost = 0;

    for (let period = 1; period <= projectEndDate; period++) {
      let periodCost = 0;

      Array.from(scheduleMap.values()).forEach(step => {
        if (period > step.startDate && period <= step.endDate) {
          const dailyCost = step.cost / step.duration;
          periodCost += dailyCost;
        }
      });

      accumulatedCost += periodCost;
      cashFlow.push({
        period,
        periodCost,
        accumulatedCost,
        accumulatedPercentage: project.totalBudget > 0 ? (accumulatedCost / project.totalBudget) * 100 : 0
      });
    }

    return {
      projectName: project.name,
      projectStartDate: 0,
      projectEndDate,
      totalCost,
      steps: Array.from(scheduleMap.values()),
      cashFlow
    };
  }

  private topologicalSort(steps: StepInput[]): StepInput[] {
    const sorted: StepInput[] = [];
    const visited = new Set<string>();
    const processing = new Set<string>(); // to detect true cycles if needed
    
    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      if (processing.has(stepId)) throw new Error('Cyclic dependency detected');
      
      processing.add(stepId);
      
      const step = steps.find(s => s.id === stepId);
      if (step && step.dependencies) {
        step.dependencies.forEach(dep => visit(dep.stepId));
      }
      
      processing.delete(stepId);
      visited.add(stepId);
      if (step) sorted.push(step);
    };

    steps.forEach(s => visit(s.id));
    return sorted;
  }
}
