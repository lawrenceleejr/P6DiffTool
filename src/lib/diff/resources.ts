import type { XER } from 'xer-parser';
import {
  diffByKey,
  type ResourceRecord,
  type AssignmentRecord,
  type CategoryDiff
} from './types';
import { num, str } from './parser-utils';

function buildResourceMap(xer: XER): Map<string, ResourceRecord> {
  const map = new Map<string, ResourceRecord>();
  const calById = xer.calendarById;
  for (const r of xer.resources) {
    const rec: ResourceRecord = {
      resourceId: String((r as any).rsrcShortName ?? (r as any).rsrcId ?? ''),
      name: String((r as any).rsrcName ?? ''),
      type: String((r as any).rsrcType ?? ''),
      calendarName: str(calById.get((r as any).clndrId)?.clndrName)
    };
    map.set(rec.resourceId, rec);
  }
  return map;
}

const RESOURCE_FIELDS = [
  { field: 'name', label: 'Resource Name', get: (r: ResourceRecord) => r.name },
  { field: 'type', label: 'Type', get: (r: ResourceRecord) => r.type },
  { field: 'calendarName', label: 'Calendar', get: (r: ResourceRecord) => r.calendarName }
] as const;

export function diffResources(oldXer: XER, newXer: XER): CategoryDiff<ResourceRecord> {
  return diffByKey(buildResourceMap(oldXer), buildResourceMap(newXer), RESOURCE_FIELDS);
}

function buildAssignmentMap(xer: XER): Map<string, AssignmentRecord> {
  const map = new Map<string, AssignmentRecord>();
  const rsrcById = new Map<number, any>();
  for (const r of xer.resources) rsrcById.set((r as any).rsrcId, r);
  for (const a of xer.taskResources) {
    const task = xer.taskById.get((a as any).taskId);
    const rsrc = rsrcById.get((a as any).rsrcId);
    if (!task || !rsrc) continue;
    const project = task.project;
    const rec: AssignmentRecord = {
      activityId: String(task.taskCode ?? ''),
      resourceId: String(rsrc.rsrcShortName ?? rsrc.rsrcId ?? ''),
      projectShortName: String(project?.projShortName ?? ''),
      budgetedUnits: num((a as any).targetQty),
      actualUnits: num((a as any).actRegQty),
      remainingUnits: num((a as any).remainQty)
    };
    const key = `${rec.projectShortName}::${rec.activityId}::${rec.resourceId}`;
    map.set(key, rec);
  }
  return map;
}

const ASSIGNMENT_FIELDS = [
  { field: 'budgetedUnits', label: 'Budgeted Units', get: (a: AssignmentRecord) => a.budgetedUnits },
  { field: 'actualUnits', label: 'Actual Units', get: (a: AssignmentRecord) => a.actualUnits },
  { field: 'remainingUnits', label: 'Remaining Units', get: (a: AssignmentRecord) => a.remainingUnits }
] as const;

export function diffAssignments(oldXer: XER, newXer: XER): CategoryDiff<AssignmentRecord> {
  return diffByKey(buildAssignmentMap(oldXer), buildAssignmentMap(newXer), ASSIGNMENT_FIELDS);
}
