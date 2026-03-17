import { Component, OnInit, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScheduleService } from '../../schedule.service';
import { ProjectScheduleResult, StepSchedule } from '../../../../models/types';
import { Chart, registerables } from 'chart.js';
import { debounceTime } from 'rxjs/operators';

Chart.register(...registerables);

@Component({
  selector: 'app-schedule-builder',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="schedule-container">
      <header class="main-header">
        <div>
           <h2>Setup & Acompanhamento: {{ projectForm.get('name')?.value }}</h2>
           <p class="subtitle" *ngIf="isBaselineFrozen">Modo de Acompanhamento (Linha de Base Congelada)</p>
           <p class="subtitle" *ngIf="!isBaselineFrozen">Modo de Planejamento Inicial</p>
        </div>
        <div class="header-actions">
           <button type="button" class="btn-primary" (click)="toggleBaseline()">
              {{ isBaselineFrozen ? 'Descongelar Linha de Base' : 'Congelar Linha de Base' }}
           </button>
        </div>
      </header>

      <div class="split-view">
        <!-- FORMULÁRIO DE EDIÇÃO DAS ETAPAS -->
        <form [formGroup]="projectForm" (ngSubmit)="calculateSchedule()" class="steps-form">
          <div class="sidebar-scroll-area custom-scrollbar">
            <div class="form-group row-input" *ngIf="!isBaselineFrozen">
               <label>Nome do Projeto:</label>
               <input formControlName="name" />
            </div>
            <div class="form-group row-input" *ngIf="!isBaselineFrozen">
               <label>Orçamento Total Estimado (R$):</label>
               <input formControlName="totalBudget" type="number" />
            </div>

            <h3>Etapas Construtivas (WBS)</h3>
            <div formArrayName="steps" class="steps-list">
            <div *ngFor="let step of steps.controls; let i=index" [formGroupName]="i" class="step-card">
              <div class="step-header">
                <span class="step-badge">Etapa {{i + 1}} - {{ step.get('name')?.value || 'Nova' }}</span>
                <button type="button" *ngIf="!isBaselineFrozen" (click)="removeStep(i)" class="btn-danger btn-sm">Excluir</button>
              </div>
              
              <!-- PLANNING MODE INPUTS -->
              <div *ngIf="!isBaselineFrozen" class="step-row">
                <input formControlName="name" placeholder="Nome" class="flex-2" />
                <input formControlName="duration" type="number" placeholder="Duração" class="flex-1" />
                <input formControlName="cost" type="number" placeholder="Custo R$" class="flex-1" />
              </div>
              
              <!-- TRACKING MODE INPUTS -->
              <div *ngIf="isBaselineFrozen" class="tracking-row">
                 <div class="track-info">
                    <small>Plan: {{step.get('duration')?.value}}d | R$ {{step.get('cost')?.value}}</small>
                 </div>
                 <div class="track-inputs">
                    <div class="input-col">
                       <label>% Concluído</label>
                       <input formControlName="progressPercentage" type="number" min="0" max="100" />
                    </div>
                    <div class="input-col">
                       <label>Início Real (Dia)</label>
                       <input formControlName="actualStartDate" type="number" />
                    </div>
                    <div class="input-col full-col">
                       <label>Custo Real (R$)</label>
                       <input formControlName="actualCost" type="number" />
                    </div>
                 </div>
              </div>
              
              <div class="deps-row mt-2" *ngIf="!isBaselineFrozen">
                 <label class="text-xs">Depende de (IDs):</label>
                 <input type="text" [value]="getDependenciesString(i)" (change)="updateDependencies(i, $event)" placeholder="Ex: 1, 2" />
              </div>
            </div>
          </div>

          </div>

          <div class="actions">
            <button type="button" *ngIf="!isBaselineFrozen" (click)="addCustomStep()" class="btn-secondary">+ Nova Tarefa</button>
            <button type="submit" class="btn-primary full-width" [disabled]="projectForm.invalid">
               Gerar Linha do Tempo
            </button>
          </div>
        </form>

        <!-- VISUALIZAÇÃO GANTT E RESULTADO -->
        <div class="gantt-board" *ngIf="scheduleResult">
          <h3>Cronograma de Execução Física</h3>
          
          <div class="summary-cards">
             <div class="card">
                <span>Prazo Original (Baseline)</span>
                <strong>{{ scheduleResult.projectEndDate }} dias</strong>
             </div>
             <div class="card trend-card" [ngClass]="getTrendClass(scheduleResult.projectedEndDate, scheduleResult.projectEndDate)">
                <span>Prazo Projetado</span>
                <strong>{{ scheduleResult.projectedEndDate }} dias</strong>
             </div>
             <div class="card">
                <span>Orçamento Base</span>
                <strong>R$ {{ scheduleResult.totalPlannedCost | number:'1.2-2' }}</strong>
             </div>
             <div class="card trend-card" [ngClass]="getTrendClass(scheduleResult.totalActualCost, scheduleResult.totalPlannedCost)">
                <span>Custo Medido/Realizado</span>
                <strong>R$ {{ scheduleResult.totalActualCost | number:'1.2-2' }}</strong>
             </div>
          </div>

          <!-- DUAL GANTT CHART -->
          <div class="gantt-chart">
            <div class="gantt-legend">
               <span class="legend-item"><div class="box gray"></div> Baseline</span>
               <span class="legend-item"><div class="box green"></div> Realizado</span>
               <span class="legend-item"><div class="box red"></div> Caminho Crítico</span>
            </div>
            
            <div *ngFor="let step of scheduleResult.steps" class="gantt-row">
              <div class="step-info">
                <strong>{{ step.name }}</strong>
                <span class="status-badge" [ngClass]="getStatusClass(step.status)">{{ step.status }}</span>
              </div>
              
              <div class="time-track-container">
                 <!-- Baseline Bar (Background/Gray) -->
                 <div class="timeline-bar baseline-bar" 
                      [style.width.%]="getBarWidth(step.duration)" 
                      [style.left.%]="getBarMargin(step.startDate)">
                 </div>
                 
                 <!-- Actual/Projected Bar (Foreground) -->
                 <div class="timeline-bar actual-bar" 
                      [ngClass]="{'critical': step.isCritical, 'frozen': isBaselineFrozen}"
                      [style.width.%]="getBarWidth(step.projectedEndDate - step.projectedStartDate)" 
                      [style.left.%]="getBarMargin(step.projectedStartDate)">
                      <!-- Progress Fill inside Actual Bar -->
                      <div class="progress-fill" [style.width.%]="step.progressPercentage || 0"></div>
                 </div>
              </div>
            </div>
          </div>
          
          <!-- S-CURVE FINANCIAL CHART -->
          <div class="s-curve-section mt-4">
             <h3>Dashboard Físico-Financeiro (Curva S)</h3>
             <div class="chart-container">
                <canvas #sCurveCanvas></canvas>
             </div>
          </div>
          
        </div>
      </div>
    </div>
  `,
  styles: [`
    .schedule-container { padding: 1.5rem 2rem; font-family: 'Inter', sans-serif; background: #f8fafc; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    .main-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; background: #fff; padding: 1.25rem 1.5rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex-shrink: 0; border: 1px solid #e2e8f0; }
    .main-header h2 { margin: 0; color: #0f172a; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.025em; }
    .subtitle { color: #64748b; font-size: 0.85rem; margin-top: 4px; font-weight: 500;}
    
    .split-view { display: flex; gap: 1.5rem; align-items: stretch; flex: 1; overflow: hidden; min-height: 0; }
    @media (max-width: 1024px) { .split-view { flex-direction: column; overflow-y: auto; } }
    
    .steps-form { width: 420px; min-width: 420px; display: flex; flex-direction: column; background: #fff; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); height: 100%; border: 1px solid #e2e8f0; }
    .sidebar-scroll-area { flex: 1; overflow-y: auto; padding-right: 8px; display: flex; flex-direction: column; gap: 1rem; margin-bottom: 0.5rem; }
    .form-group.row-input { display: flex; flex-direction: column; gap: 0.4rem; }
    .form-group label { font-size: 0.85rem; font-weight: 600; color: #475569; }
    input { padding: 0.6rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.9rem; background: #f8fafc; transition: all 0.2s; }
    input:focus { outline: none; border-color: #4f46e5; background: #fff; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
    input.flex-2 { flex: 2; width: 100%; } input.flex-1 { flex: 1; width: 100%; }
    
    .steps-list { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
    .step-card { border: 1px solid #e2e8f0; padding: 1rem; border-radius: 8px; background: #ffffff; transition: box-shadow 0.2s; }
    .step-card:hover { box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border-color: #cbd5e1; }
    .step-header { display: flex; justify-content: space-between; margin-bottom: 0.75rem; align-items: center; }
    .step-badge { font-size: 0.75rem; background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 12px; font-weight: 700; border: 1px dashed #cbd5e1; }
    .step-row { display: flex; gap: 0.5rem; }
    
    .tracking-row { display: flex; flex-direction: column; gap: 0.5rem; }
    .track-info small { color: #64748b; font-weight: 600; }
    .track-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.5rem; }
    .track-inputs .full-col { grid-column: span 2; }
    .input-col { display: flex; flex-direction: column; gap: 0.2rem; }
    .input-col label { font-size: 0.7rem; color: #64748b; font-weight: 600; }
    
    .deps-row { display: flex; flex-direction: column; gap: 0.2rem; }
    .text-xs { font-size: 0.75rem; color: #64748b; font-weight: 600; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-4 { margin-top: 2rem; }
    
    .actions { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; flex-shrink: 0; }
    button { padding: 0.75rem 1rem; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; justify-content: center; align-items: center;}
    .full-width { width: 100%; }
    .btn-primary { background: #4f46e5; color: white; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3); }
    .btn-primary:hover:not(:disabled) { background: #4338ca; transform: translateY(-1px); }
    .btn-primary:disabled { background: #a5b4fc; cursor: not-allowed; box-shadow: none; }
    .btn-secondary { background: #f1f5f9; color: #475569; border: 1px dashed #cbd5e1;}
    .btn-secondary:hover { background: #e2e8f0; color: #1e293b; border-color: #94a3b8; }
    .btn-danger { background: #fee2e2; color: #ef4444; }
    .btn-danger:hover { background: #fecaca; color: #dc2626; }
    .btn-sm { padding: 0.25rem 0.6rem; font-size: 0.75rem; border-radius: 6px; }

    /* Gantt Board Area */
    .gantt-board { flex: 1; min-width: 0; background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; overflow-y: auto; display: flex; flex-direction: column; }
    .gantt-board h3 { margin-top: 0; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 1rem; margin-bottom: 1.5rem; font-weight: 700; letter-spacing: -0.025em; }
    
    .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; flex-shrink: 0; }
    .card { background: #fff; padding: 1.25rem; border-radius: 10px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
    .card span { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .card strong { font-size: 1.25rem; color: #0f172a; margin-top: 0.5rem; }
    .trend-card.bad { border-color: #fecaca; background: #fff5f5; }
    .trend-card.bad strong { color: #e11d48; }
    .trend-card.good { border-color: #a7f3d0; background: #f0fdf4; }
    .trend-card.good strong { color: #059669; }

    /* Custom Scrollbar */
    .custom-scrollbar::-webkit-scrollbar, .gantt-board::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track, .gantt-board::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb, .gantt-board::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 3px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover, .gantt-board::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }

    /* Dual Gantt implementation */
    .gantt-chart { margin-top: 1rem; display: flex; flex-direction: column; gap: 1.25rem; }
    .gantt-legend { display: flex; gap: 1rem; font-size: 0.8rem; color: #64748b; margin-bottom: 1rem; font-weight: 500;}
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .box { width: 12px; height: 12px; border-radius: 3px; }
    .box.gray { background: #e2e8f0; }
    .box.green { background: #10b981; }
    .box.red { background: #ef4444; }

    .gantt-row { display: flex; align-items: center; gap: 15px; }
    .step-info { width: 180px; min-width: 180px; display: flex; flex-direction: column; gap: 4px; padding-right: 15px; border-right: 2px solid #f1f5f9; }
    .step-info strong { font-size: 0.85rem; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    
    .status-badge { font-size: 0.65rem; padding: 2px 6px; border-radius: 8px; font-weight: 700; display: inline-block; width: fit-content; }
    .status-badge.on-track { background: #dbeafe; color: #2563eb; }
    .status-badge.in-progress { background: #fef3c7; color: #d97706; }
    .status-badge.delayed { background: #fee2e2; color: #dc2626; }
    .status-badge.over-budget { background: #ffedd5; color: #ea580c; }
    .status-badge.completed { background: #d1fae5; color: #059669; }
    .status-badge.not-started { background: #f1f5f9; color: #64748b; }

    .time-track-container { flex: 1; position: relative; height: 36px; background: repeating-linear-gradient(90deg, transparent, transparent 19.8%, #f8fafc 19.8%, #f8fafc 20%); border-radius: 8px; }
    
    .timeline-bar { position: absolute; border-radius: 6px; height: 14px; transition: all 0.4s ease-out; }
    
    .baseline-bar { top: 4px; background: #e2e8f0; z-index: 1; border: 1px dashed #cbd5e1; }
    
    .actual-bar { top: 18px; background: #f1f5f9; border: 1px solid #cbd5e1; z-index: 2; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .actual-bar.frozen { background: #e2e8f0; border-color: #94a3b8; } /* Looks clickable/different when tracking */
    .actual-bar .progress-fill { height: 100%; background: linear-gradient(90deg, #10b981, #059669); transition: width 0.4s ease-out; }
    .actual-bar.critical { border: 2px solid #ef4444; box-shadow: 0 0 6px rgba(239, 68, 68, 0.5); }
    .actual-bar.critical.frozen { border-color: #ef4444; }

    /* Chart Area */
    .s-curve-section { border-top: 2px solid #f1f5f9; padding-top: 1.5rem; }
    .chart-container { height: 350px; width: 100%; margin-top: 1rem; position: relative; }
  `]
})
export class ScheduleBuilderComponent implements OnInit {
  projectForm!: FormGroup;
  scheduleResult: ProjectScheduleResult | null = null;
  isBaselineFrozen = false;
  
  @ViewChild('sCurveCanvas') sCurveCanvas!: ElementRef<HTMLCanvasElement>;
  chartInstance: Chart | null = null;

  constructor(private fb: FormBuilder, private scheduleSvc: ScheduleService) {}

  ngOnInit() {
    this.projectForm = this.fb.group({
      name: ['Residencial Alpha Tracking', Validators.required],
      totalDurationUsable: [180],
      timeUnit: ['days'],
      totalBudget: [150000],
      isBaselineFrozen: [false],
      steps: this.fb.array([])
    });

    this.projectForm.valueChanges.pipe(debounceTime(600)).subscribe(() => {
       // Only auto-recalculate if baseline is frozen (tracking mode)
       if (this.isBaselineFrozen) {
          this.calculateSchedule();
       }
    });

    this.loadDefaultTemplate();
  }

  get steps() { return this.projectForm.get('steps') as FormArray; }

  loadDefaultTemplate() {
    const defaults = [
      { id: '1', name: 'Serviços Preliminares', duration: 10, cost: 5000, dependencies: [] },
      { id: '2', name: 'Fundação', duration: 20, cost: 35000, dependencies: [{ stepId: '1', type: 'FS' }] },
      { id: '3', name: 'Superestrutura', duration: 30, cost: 50000, dependencies: [{ stepId: '2', type: 'FS' }] },
      { id: '4', name: 'Acabamento', duration: 20, cost: 15000, dependencies: [{ stepId: '3', type: 'FS' }] }
    ];

    defaults.forEach(item => {
      this.steps.push(this.fb.group({
        id: [item.id],
        name: [item.name, Validators.required],
        duration: [item.duration, Validators.required],
        cost: [item.cost],
        dependencies: [item.dependencies],
        // Tracking Fields
        progressPercentage: [0], // fixed from string
        actualStartDate: [null],
        actualCost: [null]
      }));
    });
  }

  addCustomStep() {
    this.steps.push(this.fb.group({
      id: [Math.random().toString(36).substring(7)],
      name: ['', Validators.required],
      duration: [1],
      cost: [0],
      dependencies: [[]],
      progressPercentage: [0],
      actualStartDate: [null],
      actualCost: [null]
    }));
  }

  removeStep(index: number) { this.steps.removeAt(index); }

  toggleBaseline() {
    this.isBaselineFrozen = !this.isBaselineFrozen;
    this.projectForm.get('isBaselineFrozen')?.setValue(this.isBaselineFrozen);
    
    // Automatically recalculate to show tracking layout impacts
    if (this.isBaselineFrozen) {
       this.calculateSchedule();
    }
  }

  getDependenciesString(index: number): string {
    const deps = this.steps.at(index).get('dependencies')?.value;
    if (!deps || !Array.isArray(deps)) return '';
    return deps.map((d: any) => d.stepId).join(', ');
  }

  updateDependencies(index: number, event: any) {
    const value = event.target.value;
    if (!value.trim()) {
       this.steps.at(index).get('dependencies')?.setValue([]); return;
    }
    const depsIds = value.split(',').map((s: string) => s.trim()).filter((s: string) => s);
    const depsArray = depsIds.map((id: string) => ({ stepId: id, type: 'FS' }));
    this.steps.at(index).get('dependencies')?.setValue(depsArray);
  }

  calculateSchedule() {
    if (this.projectForm.invalid) return;
    const projectData = this.projectForm.value;
    
    this.scheduleSvc.calculateSchedule(projectData).subscribe({
      next: (res) => {
        this.scheduleResult = res;
        setTimeout(() => {
           this.renderChart();
        }, 100);
      },
      error: (err) => {
        console.error('Error calculating schedule:', err);
        alert('Erro ao calcular cronograma: verifique dependências.');
      }
    });
  }

  // --- UI Helpers ---
  getBarWidth(duration: number): number {
    if (!this.scheduleResult || this.scheduleResult.projectedEndDate === 0) return 0;
    const maxEnd = Math.max(this.scheduleResult.projectEndDate, this.scheduleResult.projectedEndDate);
    return (duration / maxEnd) * 100;
  }

  getBarMargin(startDate: number): number {
    if (!this.scheduleResult || this.scheduleResult.projectedEndDate === 0) return 0;
    const maxEnd = Math.max(this.scheduleResult.projectEndDate, this.scheduleResult.projectedEndDate);
    if (startDate === undefined || startDate === null) return 0;
    return (startDate / maxEnd) * 100;
  }

  getTrendClass(actual: number, planned: number): string {
     if (actual > planned) return 'bad';
     if (actual <= planned && actual > 0) return 'good';
     return '';
  }

  getStatusClass(status: string): string {
     return status.toLowerCase().replace(' ', '-');
  }

  // --- Chart.js Integration ---
  renderChart() {
     if (!this.scheduleResult || !this.sCurveCanvas) return;
     
     if (this.chartInstance) {
        this.chartInstance.destroy();
     }

     const ctx = this.sCurveCanvas.nativeElement.getContext('2d');
     if (!ctx) return;

     const labels = this.scheduleResult.cashFlow.map(c => 'Dia ' + c.period);
     const plannedData = this.scheduleResult.cashFlow.map(c => c.plannedAccumulatedCost);
     const actualData = this.scheduleResult.cashFlow.map(c => c.actualAccumulatedCost);

     // Truncate actual data up to the last day with progress to show the "line stopping" effectively
     // For MVP we just plot all. It stays flat if no more progress.

     this.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
           labels: labels,
           datasets: [
              {
                 label: 'Custo Planejado Acumulado (Baseline)',
                 data: plannedData,
                 borderColor: '#94a3b8',
                 backgroundColor: 'rgba(148, 163, 184, 0.1)',
                 borderWidth: 2,
                 fill: true,
                 borderDash: [5, 5], // Dashed line to indicate planned
                 tension: 0.3,
                 pointRadius: 0
              },
              {
                 label: 'Custo Realizado/Agregado Acumulado',
                 data: actualData,
                 borderColor: '#2563eb', // Indigo brand color
                 backgroundColor: 'rgba(37, 99, 235, 0.15)',
                 borderWidth: 3,
                 fill: true,
                 tension: 0.3,
                 pointRadius: 2,
                 pointBackgroundColor: '#2563eb'
              }
           ]
        },
        options: {
           responsive: true,
           maintainAspectRatio: false,
           animation: false,
           interaction: {
              mode: 'index',
              intersect: false,
           },
           plugins: {
              legend: {
                 position: 'top',
                 labels: { font: { family: 'Inter', size: 12 } }
              },
              tooltip: {
                 backgroundColor: 'rgba(15, 23, 42, 0.9)',
                 titleFont: { family: 'Inter', size: 13 },
                 bodyFont: { family: 'Inter', size: 13 },
                 padding: 10,
                 callbacks: {
                    label: function(context) {
                       let label = context.dataset.label || '';
                       if (label) { label += ': '; }
                       if (context.parsed.y !== null) {
                          label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                       }
                       return label;
                    }
                 }
              }
           },
           scales: {
              y: {
                 beginAtZero: true,
                 grid: { color: '#f1f5f9' },
                 ticks: {
                    font: { family: 'Inter', size: 11 },
                    callback: function(value) {
                       return 'R$ ' + value; 
                    }
                 }
              },
              x: {
                 grid: { display: false },
                 ticks: { font: { family: 'Inter', size: 11 }, maxTicksLimit: 15 }
              }
           }
        }
     });
  }
}
