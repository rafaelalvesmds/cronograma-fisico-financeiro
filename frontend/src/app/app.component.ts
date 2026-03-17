import { Component } from '@angular/core';
import { ScheduleBuilderComponent } from './features/schedule/pages/schedule-builder/schedule-builder.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ScheduleBuilderComponent],
  template: `<app-schedule-builder></app-schedule-builder>`
})
export class AppComponent {
  title = 'frontend';
}
