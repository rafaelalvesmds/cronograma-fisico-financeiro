import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ProjectInput, ProjectScheduleResult } from '../../models/types';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ScheduleService {
  private apiUrl = `${environment.apiUrl}/schedule`;

  constructor(private http: HttpClient) {}

  calculateSchedule(project: ProjectInput): Observable<ProjectScheduleResult> {
    return this.http.post<ProjectScheduleResult>(`${this.apiUrl}/calculate`, project);
  }
}
