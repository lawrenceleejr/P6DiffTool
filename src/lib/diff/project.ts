import type { XER } from 'xer-parser';
import {
  diffByKey,
  type ProjectRecord,
  type CategoryDiff
} from './types';
import { dateStr } from './parser-utils';

function buildMap(xer: XER): Map<string, ProjectRecord> {
  const map = new Map<string, ProjectRecord>();
  for (const p of xer.projects) {
    const rec: ProjectRecord = {
      shortName: String((p as any).projShortName ?? ''),
      name: String((p as any).projShortName ?? ''),
      dataDate: dateStr((p as any).lastRecalcDate),
      plannedStart: dateStr((p as any).planStartDate),
      plannedFinish: dateStr((p as any).planEndDate) ?? dateStr((p as any).scdEndDate)
    };
    if (rec.shortName) map.set(rec.shortName, rec);
  }
  return map;
}

const PROJECT_FIELDS = [
  { field: 'dataDate', label: 'Data Date', get: (p: ProjectRecord) => p.dataDate },
  { field: 'plannedStart', label: 'Planned Start', get: (p: ProjectRecord) => p.plannedStart },
  { field: 'plannedFinish', label: 'Planned Finish', get: (p: ProjectRecord) => p.plannedFinish }
] as const;

export function diffProject(oldXer: XER, newXer: XER): CategoryDiff<ProjectRecord> {
  return diffByKey(buildMap(oldXer), buildMap(newXer), PROJECT_FIELDS);
}
