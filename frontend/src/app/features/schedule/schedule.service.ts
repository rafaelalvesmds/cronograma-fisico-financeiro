import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ProjectInput, ProjectScheduleResult } from '../../models/types';

@Injectable({
  providedIn: 'root'
})
export class ScheduleService {
  private apiUrl = 'http://localhost:3000/api/schedule';

  constructor(private http: HttpClient) {}

  calculateSchedule(project: ProjectInput): Observable<ProjectScheduleResult> {
    return this.http.post<ProjectScheduleResult>(`${this.apiUrl}/calculate`, project);
  }
}
