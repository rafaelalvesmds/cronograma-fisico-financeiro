import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScheduleService } from '../../schedule.service';
import { ProjectScheduleResult, StepSchedule } from '../../../../models/types';

@Component({
  selector: 'app-schedule-builder',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="app-layout">
      <!-- SIDEBAR FORM -->
      <aside class="sidebar-setup panel">
        <header class="panel-header">
          <div class="icon-box">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
          <div>
            <h2 class="title">Setup Projeto</h2>
            <p class="subtitle">Configure o WBS e custos reais</p>
          </div>
        </header>

        <form [formGroup]="projectForm" (ngSubmit)="calculateSchedule()" class="builder-form">
          <div class="form-section">
             <div class="form-group row-input">
                <label>Nome do Empreendimento</label>
                <input formControlName="name" placeholder="Ex: Torre Alpha" />
             </div>
             
             <div class="grid-2-col">
                <div class="form-group row-input">
                   <label>Orçamento Base (R$)</label>
                   <input formControlName="totalBudget" type="number" />
                </div>
                <!-- Time Unit and Total Duration inputs hidden in MVP, defaulted in background -->
             </div>
          </div>

          <div class="form-section mt-4">
             <div class="section-title">
                <h3>Etapas Construtivas</h3>
             </div>
             
             <div formArrayName="steps" class="steps-list custom-scrollbar">
                <div *ngFor="let step of steps.controls; let i=index" [formGroupName]="i" class="step-card">
                   <div class="step-header">
                      <div class="step-badge">ID: {{ step.get('id')?.value }}</div>
                      <button type="button" (click)="removeStep(i)" class="btn-icon danger" title="Excluir Etapa">
                         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                   </div>
                   
                   <div class="form-group">
                      <input formControlName="name" placeholder="Nome da Etapa" class="input-lg" />
                   </div>
                   
                   <div class="grid-2-col gap-sm">
                      <div class="form-group">
                         <label class="text-xs">Duração (dias)</label>
                         <input formControlName="duration" type="number" min="1" />
                      </div>
                      <div class="form-group">
                         <label class="text-xs">Custo (R$)</label>
                         <input formControlName="cost" type="number" min="0" />
                      </div>
                   </div>
                   
                   <div class="form-group deps-group">
                      <label class="text-xs">Depende de (IDs, vírgula):</label>
                      <input type="text" [value]="getDependenciesString(i)" (change)="updateDependencies(i, $event)" placeholder="Ex: 1, 3" />
                   </div>
                </div>
             </div>
             
             <button type="button" (click)="addCustomStep()" class="btn-outline dashed full-width mt-3">
               + Adicionar Nova Etapa WBS
             </button>
          </div>

        </form>
        <div class="sidebar-footer">
            <button type="submit" class="btn-primary full-width lg" [disabled]="projectForm.invalid" (click)="calculateSchedule()">
               Gerar Linha do Tempo
               <svg style="margin-left: 8px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
      </aside>

      <!-- MAIN CONTENT: GANTT CHART -->
      <main class="main-content">
        <header class="topbar">
           <h1>{{ projectForm.get('name')?.value || 'Cronograma Físico-Financeiro' }}</h1>
           <div class="status-badge live" *ngIf="scheduleResult">Motor Agendado</div>
        </header>
        
        <div class="dashboard-grid" *ngIf="scheduleResult; else emptyState">
           
           <!-- Metrics Row -->
           <div class="metrics-row">
              <div class="metric-card">
                 <div class="icon bg-indigo-light">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                 </div>
                 <div class="data">
                    <p>Prazo Calculado</p>
                    <h3>{{ scheduleResult.projectEndDate }} dias</h3>
                 </div>
              </div>

              <div class="metric-card">
                 <div class="icon bg-emerald-light">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-emerald"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                 </div>
                 <div class="data">
                    <p>Custo Alocado</p>
                    <h3>{{ scheduleResult.totalCost | currency:'BRL':'R$' }}</h3>
                 </div>
              </div>

              <div class="metric-card">
                 <div class="icon bg-slate">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                 </div>
                 <div class="data">
                    <p>Total de Etapas</p>
                    <h3>{{ scheduleResult.steps.length }} un.</h3>
                 </div>
              </div>
           </div>

           <!-- Gantt Chart Panel -->
           <div class="panel gantt-board mt-4">
              <div class="panel-header border-bottom">
                 <h2 class="title">Visualização Gantt</h2>
              </div>
              
              <div class="gantt-container" [ngClass]="{'animate-in': animationTrigger}">
                 <div class="gantt-row header">
                    <div class="task-col">WBS ID / Nome da Tarefa</div>
                    <div class="timeline-col">Linha do Tempo (Dias)
                       <div class="scale-marks">
                          <span>0</span>
                          <span>{{ Math.ceil(scheduleResult.projectEndDate / 2) }}</span>
                          <span>{{ scheduleResult.projectEndDate }}</span>
                       </div>
                    </div>
                 </div>

                 <div *ngFor="let step of scheduleResult.steps" class="gantt-row task-row">
                    <div class="task-col">
                       <div class="task-title-flex">
                          <span class="id-pill">{{ step.id }}</span>
                          <strong>{{ step.name }}</strong>
                       </div>
                       <div class="task-meta">
                          <span>{{step.duration}}d</span> • <span>{{step.cost | currency:'BRL':'R$'}}</span>
                          <span *ngIf="isCriticalPath(step)" class="critical-indicator" title="Caminho Crítico">🔥</span>
                       </div>
                    </div>
                    
                    <div class="timeline-col">
                       <!-- Track background -->
                       <div class="timeline-track">
                          <div class="timeline-bar" 
                               [ngClass]="{'critical': isCriticalPath(step)}"
                               [style.width.%]="getBarWidth(step.duration)" 
                               [style.left.%]="getBarMargin(step.startDate)">
                               <span class="bar-label">{{step.startDate}} a {{step.endDate}}</span>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
           </div>

           <!-- S-Curve Financial Summary Panel -->
           <div class="panel mt-4 mb-4">
              <div class="panel-header border-bottom">
                 <h2 class="title">Demonstrativo de Desembolso (Curva S)</h2>
                 <p class="subtitle text-xs">Acompanhamento consolidado do custo estimado (Agrupado simplificado MVP)</p>
              </div>
              <div class="s-curve-container p-4">
                 <div class="table-responsive">
                    <table class="modern-table">
                       <thead>
                          <tr>
                             <th>Período (Dia)</th>
                             <th>Custo do Dia</th>
                             <th>Custo Acumulado</th>
                             <th>% Concluído</th>
                          </tr>
                       </thead>
                       <tbody>
                          <!-- Showing max 10 periods for the MVP UI to avoid very long tables, picking strategic points -->
                          <tr *ngFor="let flow of getSummaryCashFlow(scheduleResult.cashFlow)">
                             <td>Dia {{ flow.period }}</td>
                             <td>{{ flow.periodCost | currency:'BRL':'R$' }}</td>
                             <td class="font-bold">{{ flow.accumulatedCost | currency:'BRL':'R$' }}</td>
                             <td>
                                <div class="progress-wrap">
                                   <div class="progress-bg">
                                      <div class="progress-fill" [style.width.%]="flow.accumulatedPercentage"></div>
                                   </div>
                                   <span class="text-xs">{{ flow.accumulatedPercentage | number:'1.0-1' }}%</span>
                                </div>
                             </td>
                          </tr>
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>

        </div>

        <ng-template #emptyState>
           <div class="empty-state">
              <div class="illustration">
                 <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              </div>
              <h3>Pronto para planejar</h3>
              <p>Configure as etapas WBS no painel lateral e clique em <b>Gerar Linha do Tempo</b> para visualizar o Gráfico de Gantt e a Curva S Financeira do seu projeto.</p>
           </div>
        </ng-template>

      </main>
    </div>
  `,
  styleUrls: ['./schedule-builder.component.css']
})
export class ScheduleBuilderComponent implements OnInit {
  projectForm!: FormGroup;
  scheduleResult: ProjectScheduleResult | null = null;
  Math = Math;
  animationTrigger = false;

  constructor(private fb: FormBuilder, private scheduleSvc: ScheduleService) {}

  ngOnInit() {
    this.projectForm = this.fb.group({
      name: ['Residencial Alpha', Validators.required],
      totalDurationUsable: [180],
      timeUnit: ['days'],
      totalBudget: [150000],
      steps: this.fb.array([])
    });

    this.loadDefaultTemplate();
  }

  get steps() {
    return this.projectForm.get('steps') as FormArray;
  }

  loadDefaultTemplate() {
    const defaults = [
      { id: '1', name: 'Serviços Preliminares', duration: 10, cost: 5000, dependencies: [] },
      { id: '2', name: 'Fundação', duration: 20, cost: 35000, dependencies: [{ stepId: '1', type: 'FS' }] },
      { id: '3', name: 'Superestrutura', duration: 30, cost: 50000, dependencies: [{ stepId: '2', type: 'FS' }] },
      { id: '4', name: 'Cobertura', duration: 15, cost: 20000, dependencies: [{ stepId: '3', type: 'FS' }] },
      { id: '5', name: 'Alvenaria', duration: 15, cost: 15000, dependencies: [{ stepId: '3', type: 'FS' }] },
      { id: '6', name: 'Instalação Elétrica', duration: 20, cost: 15000, dependencies: [{ stepId: '5', type: 'FS' }] },
      { id: '7', name: 'Instalação Hidráulica', duration: 20, cost: 10000, dependencies: [{ stepId: '5', type: 'FS' }] },
      { id: '8', name: 'Acabamento', duration: 30, cost: 15000, dependencies: [{ stepId: '4', type: 'FS' }, { stepId: '6', type: 'FS' }, { stepId: '7', type: 'FS' }] }
    ];

    defaults.forEach(item => {
      this.steps.push(this.fb.group({
        id: [item.id],
        name: [item.name, Validators.required],
        duration: [item.duration, Validators.required],
        cost: [item.cost],
        dependencies: [item.dependencies]
      }));
    });
  }

  addCustomStep() {
    this.steps.push(this.fb.group({
      id: [Math.floor(Math.random() * 900) + 100 + ''],
      name: ['', Validators.required],
      duration: [1],
      cost: [0],
      dependencies: [[]]
    }));
  }

  removeStep(index: number) {
    this.steps.removeAt(index);
  }

  getDependenciesString(index: number): string {
    const deps = this.steps.at(index).get('dependencies')?.value;
    if (!deps || !Array.isArray(deps)) return '';
    return deps.map((d: any) => d.stepId).join(', ');
  }

  updateDependencies(index: number, event: any) {
    const value = event.target.value;
    if (!value.trim()) {
       this.steps.at(index).get('dependencies')?.setValue([]);
       return;
    }
    const depsIds = value.split(',').map((s: string) => s.trim()).filter((s: string) => s);
    const depsArray = depsIds.map((id: string) => ({ stepId: id, type: 'FS' }));
    this.steps.at(index).get('dependencies')?.setValue(depsArray);
  }

  calculateSchedule() {
    if (this.projectForm.invalid) return;
    const projectData = this.projectForm.value;
    
    this.animationTrigger = false;
    this.scheduleSvc.calculateSchedule(projectData).subscribe({
      next: (res) => {
        this.scheduleResult = res;
        setTimeout(() => this.animationTrigger = true, 50);
      },
      error: (err) => {
        console.error('Error calculating schedule:', err);
        alert('Erro ao calcular cronograma: verifique se há dependências cíclicas (loop).');
      }
    });
  }

  getBarWidth(duration: number): number {
    if (!this.scheduleResult || this.scheduleResult.projectEndDate === 0) return 0;
    return (duration / this.scheduleResult.projectEndDate) * 100;
  }

  getBarMargin(startDate: number): number {
    if (!this.scheduleResult || this.scheduleResult.projectEndDate === 0) return 0;
    return (startDate / this.scheduleResult.projectEndDate) * 100;
  }

  // Simplified Critical Path check for MVP: Any task that ends exactly when the project ends,
  // or takes up significant portion sequentially
  isCriticalPath(step: StepSchedule): boolean {
    if (!this.scheduleResult) return false;
    // Real logic via CPM would trace parents backwards. MVP Logic:
    return step.endDate === this.scheduleResult.projectEndDate;
  }

  // Condense the daily cash flow into meaningful steps for the UI table
  getSummaryCashFlow(flow: any[]): any[] {
     if (!flow || flow.length === 0) return [];
     if (flow.length <= 10) return flow;
     
     // Take roughly 10 snapshots equally sparse (10%, 20%, ... 100%)
     const stepSize = Math.max(1, Math.floor(flow.length / 10));
     const result = [];
     for(let i = stepSize - 1; i < flow.length; i += stepSize) {
        result.push(flow[i]);
     }
     
     // Ensure last element is always included
     if (result[result.length - 1].period !== flow[flow.length - 1].period) {
        result.push(flow[flow.length - 1]);
     }
     return result;
  }
}
