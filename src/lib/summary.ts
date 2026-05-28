// Per-file project status metrics: the "nice table representation" of project
// status shown in the Overview tab alongside the diff.

import type { XER } from 'xer-parser';
import { dateStr, durationHours } from './diff/parser-utils';

export interface FileSummary {
  projectShortName: string;
  projectName: string;
  dataDate?: string;
  plannedStart?: string;
  plannedFinish?: string;
  totalActivities: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  milestones: number;
  criticalActivities: number;       // total float <= 0
  totalRelationships: number;
  totalWbs: number;
  totalResources: number;
  totalCalendars: number;
  schedulePctComplete: number;      // 0..100, weighted by activity count
}

export function summarize(xer: XER): FileSummary {
  const project = xer.projects[0];

  let notStarted = 0;
  let inProgress = 0;
  let completed = 0;
  let milestones = 0;
  let critical = 0;
  let pctSum = 0;
  let pctCount = 0;

  for (const t of xer.tasks) {
    switch (String(t.statusCode)) {
      case 'TK_NotStart': notStarted += 1; break;
      case 'TK_Active':   inProgress += 1; break;
      case 'TK_Complete': completed += 1; break;
    }
    const tt = String(t.taskType);
    if (tt === 'TT_Mile' || tt === 'TT_FinMile') milestones += 1;
    const tf = durationHours(t.totalFloat);
    if (tf !== undefined && tf <= 0) critical += 1;
    const pc = Number(t.physCompletePct);
    if (Number.isFinite(pc)) { pctSum += pc; pctCount += 1; }
  }

  return {
    projectShortName: String((project as any)?.projShortName ?? ''),
    projectName: String((project as any)?.projShortName ?? ''),
    dataDate: dateStr((project as any)?.lastRecalcDate),
    plannedStart: dateStr((project as any)?.planStartDate),
    plannedFinish: dateStr((project as any)?.planEndDate) ?? dateStr((project as any)?.scdEndDate),
    totalActivities: xer.tasks.length,
    notStarted,
    inProgress,
    completed,
    milestones,
    criticalActivities: critical,
    totalRelationships: xer.taskPredecessors.length,
    totalWbs: xer.projWBS.length,
    totalResources: xer.resources.length,
    totalCalendars: xer.calendars.length,
    schedulePctComplete: pctCount > 0 ? Math.round(pctSum / pctCount) : 0
  };
}
