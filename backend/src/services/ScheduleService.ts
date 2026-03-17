import { ProjectInput, ProjectScheduleResult, StepInput, StepSchedule, CashFlowPeriod } from '../models/types';

export class ScheduleService {
  
  public calculateSchedule(project: ProjectInput): ProjectScheduleResult {
    // 1. Resolve Execution Order (Topological Sort)
    const sortedSteps = this.topologicalSort(project.steps);

    // Track state
    const scheduleMap = new Map<string, StepSchedule>();
    let projectEndDate = 0;
    let projectedProjectEndDate = 0;
    let totalPlannedCost = 0;
    let totalActualCost = 0;

    // 2. FORWARD PASS (Early Start / Early Finish) & Actual Dates
    for (const step of sortedSteps) {
      let earlyStart = 0;
      let projectedStartDate = 0;
      
      // Calculate start dates based on predecessors
      if (step.dependencies && step.dependencies.length > 0) {
        step.dependencies.forEach(dep => {
          const parentSchedule = scheduleMap.get(dep.stepId);
          if (parentSchedule) {
            earlyStart = Math.max(earlyStart, parentSchedule.earlyFinish);
            projectedStartDate = Math.max(projectedStartDate, parentSchedule.projectedEndDate);
          }
        });
      }

      const duration = Number(step.duration || 0);
      const cost = Number(step.cost || 0);
      
      const earlyFinish = earlyStart + duration;
      
      // Actual dates computation (Tracking)
      const actStart: any = step.actualStartDate;
      const actualStart = actStart !== undefined && actStart !== null && actStart !== '' && Number(actStart) > 0 ? Number(actStart) : projectedStartDate;
      const progress = Number(step.progressPercentage || 0);
      
      let actualEnd = actualStart + duration;
      const actEnd: any = step.actualEndDate;
      if (actEnd !== undefined && actEnd !== null && actEnd !== '' && Number(actEnd) > 0 && progress === 100) {
         actualEnd = Number(actEnd);
      }

      // Cost tracking
      const actCost: any = step.actualCost;
      const earnedCost = actCost !== undefined && actCost !== null && actCost !== '' ? Number(actCost) : (cost * (progress / 100));

      const scheduledStep: StepSchedule = {
        ...step,
        startDate: earlyStart,
        endDate: earlyFinish,
        projectedStartDate: actualStart,
        projectedEndDate: actualEnd,
        earlyStart,
        earlyFinish,
        lateStart: 0, // calculated in backward pass
        lateFinish: 0,
        totalFloat: 0,
        isCritical: false,
        status: this.determineStatus(actualStart, actualEnd, earlyStart, earlyFinish, progress, earnedCost, step.cost)
      };

      scheduleMap.set(step.id, scheduledStep);
      projectEndDate = Math.max(projectEndDate, earlyFinish);
      projectedProjectEndDate = Math.max(projectedProjectEndDate, actualEnd);
      totalPlannedCost += cost;
      totalActualCost += earnedCost;
    }

    // 3. BACKWARD PASS (Late Start / Late Finish & Critical Path)
    // Initialize lateFinish for all nodes. Nodes with no successors have lateFinish = projectEndDate
    const sortedReversed = [...sortedSteps].reverse();
    
    // Quick map to find all successors of a node
    const successorsMap = new Map<string, string[]>();
    for (const step of sortedSteps) {
      if (!successorsMap.has(step.id)) successorsMap.set(step.id, []);
      if (step.dependencies) {
         step.dependencies.forEach(d => {
            const list = successorsMap.get(d.stepId) || [];
            list.push(step.id);
            successorsMap.set(d.stepId, list);
         });
      }
    }

    for (const step of sortedReversed) {
      const scheduledStep = scheduleMap.get(step.id)!;
      const successors = successorsMap.get(step.id) || [];
      
      let lateFinish = projectEndDate; // Default if no successors
      if (successors.length > 0) {
        let minSuccessorLateStart = Infinity;
        successors.forEach(succId => {
          const succ = scheduleMap.get(succId)!;
          if (succ.lateStart < minSuccessorLateStart) {
             minSuccessorLateStart = succ.lateStart;
          }
        });
        lateFinish = minSuccessorLateStart;
      }

      scheduledStep.lateFinish = lateFinish;
      scheduledStep.lateStart = lateFinish - Number(scheduledStep.duration || 0);
      scheduledStep.totalFloat = scheduledStep.lateStart - scheduledStep.earlyStart;
      scheduledStep.isCritical = scheduledStep.totalFloat === 0;
    }

    // 4. Compute Cash Flow (S-Curve)
    const cashFlow: CashFlowPeriod[] = [];
    let plannedAccumulated = 0;
    let actualAccumulated = 0;
    
    const absoluteEnd = Math.max(projectEndDate, projectedProjectEndDate);

    for (let period = 1; period <= absoluteEnd; period++) {
      let plannedPeriodCost = 0;
      let actualPeriodCost = 0;

      Array.from(scheduleMap.values()).forEach(step => {
        // PLANNED distribution
        if (period > step.startDate && period <= step.endDate) {
          plannedPeriodCost += Number(step.cost || 0) / Number(step.duration || 1);
        }
        
        // ACTUAL/EARNED distribution
        // Distribute the earned cost over the duration it took (or is currently taking)
        let projDuration = step.projectedEndDate - step.projectedStartDate;
        if (projDuration === 0) projDuration = 1; // prevent division by zero for 0-day milestones

        if (period > step.projectedStartDate && period <= step.projectedEndDate) {
           const stepEarnedCost = step.actualCost !== undefined && step.actualCost !== null 
                                  ? step.actualCost 
                                  : (step.cost * ((step.progressPercentage || 0) / 100));
           actualPeriodCost += stepEarnedCost / projDuration;
        }
      });

      plannedAccumulated += plannedPeriodCost;
      actualAccumulated += actualPeriodCost;
      
      cashFlow.push({
        period,
        plannedPeriodCost,
        plannedAccumulatedCost: plannedAccumulated,
        plannedAccumulatedPercentage: project.totalBudget > 0 ? (plannedAccumulated / project.totalBudget) * 100 : 0,
        actualPeriodCost,
        actualAccumulatedCost: actualAccumulated,
        actualAccumulatedPercentage: project.totalBudget > 0 ? (actualAccumulated / project.totalBudget) * 100 : 0
      });
    }

    return {
      projectName: project.name,
      projectStartDate: 0,
      projectEndDate,
      projectedEndDate: projectedProjectEndDate,
      totalPlannedCost,
      totalActualCost,
      steps: Array.from(scheduleMap.values()),
      cashFlow
    };
  }

  private determineStatus(actualStart: number, actualEnd: number, pStart: number, pEnd: number, progress: number, actualCost: number, plannedCost: number): StepSchedule['status'] {
     if (progress === 100) return 'Completed';
     
     // Only consider it 'Delayed' IF the current day (or actualStart) has passed the planned start AND no progress exists, 
     // OR if it's in progress but actual end > planned end. 
     // For a true system we'd need a "Current Date" tracking line. For now, rely on actuals.
     
     if (progress > 0) {
        if (actualCost > plannedCost) return 'Over Budget';
        if (actualEnd > pEnd) return 'Delayed';
        return 'In Progress';
     }
     
     // If no progress, but the user explicitly set an actual start date that is greater than planned start
     if (actualStart > pStart && actualStart !== 0) return 'Delayed';
     
     return 'Not Started';
     // Simplify to "On Track" within frontend if neither delayed nor over budget
  }

  private topologicalSort(steps: StepInput[]): StepInput[] {
    const sorted: StepInput[] = [];
    const visited = new Set<string>();
    const processing = new Set<string>();
    
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
