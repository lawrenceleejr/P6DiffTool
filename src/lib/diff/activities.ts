import type { XER } from 'xer-parser';
import {
  diffByKey,
  type ActivityRecord,
  type CategoryDiff
} from './types';
import { dateStr, durationHours, num, str } from './parser-utils';
import { wbsPathForId } from './wbs';

/** Map an xer-parser Task to a comparable plain ActivityRecord. */
export function toActivityRecord(xer: XER, task: any): ActivityRecord {
  const project = task.project;
  const calendar = task.calendar;
  const wbs = task.wbs;
  return {
    activityId: String(task.taskCode ?? ''),
    projectShortName: String(project?.projShortName ?? ''),
    name: String(task.taskName ?? ''),
    type: String(task.taskType ?? ''),
    status: String(task.statusCode ?? ''),
    pctComplete: num(task.physCompletePct),
    originalDurationHrs: durationHours(task.targetDrtn),
    remainingDurationHrs: durationHours(task.remainDrtn),
    targetStart: dateStr(task.targetStartDate),
    targetFinish: dateStr(task.targetEndDate),
    actualStart: dateStr(task.actStartDate),
    actualFinish: dateStr(task.actEndDate),
    totalFloatHrs: durationHours(task.totalFloat),
    freeFloatHrs: durationHours(task.freeFloat),
    constraintType: str(task.cstrType),
    constraintDate: dateStr(task.cstrDate),
    calendarName: str(calendar?.clndrName),
    wbsPath: wbs ? wbsPathForId(xer, wbs.wbsId) : undefined
  };
}

function buildMap(xer: XER): Map<string, ActivityRecord> {
  const map = new Map<string, ActivityRecord>();
  for (const task of xer.tasks) {
    const rec = toActivityRecord(xer, task);
    // Match purely by Activity ID — we deliberately ignore the project
    // short name so the diff still aligns rows across files that differ
    // only by project rename / id.
    map.set(rec.activityId, rec);
  }
  return map;
}

const ACTIVITY_FIELDS = [
  { field: 'name', label: 'Activity Name', get: (r: ActivityRecord) => r.name },
  { field: 'type', label: 'Type', get: (r: ActivityRecord) => r.type },
  { field: 'status', label: 'Status', get: (r: ActivityRecord) => r.status },
  { field: 'pctComplete', label: '% Complete', get: (r: ActivityRecord) => r.pctComplete },
  { field: 'originalDurationHrs', label: 'Original Duration (hrs)', get: (r: ActivityRecord) => r.originalDurationHrs },
  { field: 'remainingDurationHrs', label: 'Remaining Duration (hrs)', get: (r: ActivityRecord) => r.remainingDurationHrs },
  { field: 'targetStart', label: 'Planned Start', get: (r: ActivityRecord) => r.targetStart },
  { field: 'targetFinish', label: 'Planned Finish', get: (r: ActivityRecord) => r.targetFinish },
  { field: 'actualStart', label: 'Actual Start', get: (r: ActivityRecord) => r.actualStart },
  { field: 'actualFinish', label: 'Actual Finish', get: (r: ActivityRecord) => r.actualFinish },
  { field: 'totalFloatHrs', label: 'Total Float (hrs)', get: (r: ActivityRecord) => r.totalFloatHrs },
  { field: 'freeFloatHrs', label: 'Free Float (hrs)', get: (r: ActivityRecord) => r.freeFloatHrs },
  { field: 'constraintType', label: 'Constraint Type', get: (r: ActivityRecord) => r.constraintType },
  { field: 'constraintDate', label: 'Constraint Date', get: (r: ActivityRecord) => r.constraintDate },
  { field: 'calendarName', label: 'Calendar', get: (r: ActivityRecord) => r.calendarName },
  { field: 'wbsPath', label: 'WBS', get: (r: ActivityRecord) => r.wbsPath }
] as const;

export function diffActivities(oldXer: XER, newXer: XER): CategoryDiff<ActivityRecord> {
  return diffByKey(buildMap(oldXer), buildMap(newXer), ACTIVITY_FIELDS);
}
