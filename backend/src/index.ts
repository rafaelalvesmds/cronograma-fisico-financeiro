import express, { Request, Response } from 'express';
import cors from 'cors';
import { ScheduleService } from './services/ScheduleService';
import { ProjectInput } from './models/types';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const scheduleService = new ScheduleService();

app.post('/api/schedule/calculate', (req: Request, res: Response) => {
  try {
    const projectInput: ProjectInput = req.body;
    
    if (!projectInput || !projectInput.steps) {
      return res.status(400).json({ error: 'Invalid project payload' });
    }

    const schedule = scheduleService.calculateSchedule(projectInput);
    return res.json(schedule);
  } catch (err: any) {
    console.error('Error calculating schedule:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Backend schedule engine running at http://localhost:${port}`);
});
