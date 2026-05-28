import type { XER } from 'xer-parser';
import {
  diffByKey,
  type RelationshipRecord,
  type CategoryDiff
} from './types';
import { durationHours } from './parser-utils';

function buildMap(xer: XER): Map<string, RelationshipRecord> {
  const map = new Map<string, RelationshipRecord>();
  for (const tp of xer.taskPredecessors) {
    const pred = xer.taskById.get(tp.predTaskId);
    const succ = xer.taskById.get(tp.taskId);
    if (!pred || !succ) continue;
    const project = succ.project;
    const rec: RelationshipRecord = {
      predecessorId: String(pred.taskCode ?? ''),
      successorId: String(succ.taskCode ?? ''),
      type: String(tp.predType ?? ''),
      lagHrs: durationHours(tp.lag),
      projectShortName: String(project?.projShortName ?? '')
    };
    const key = `${rec.projectShortName}::${rec.predecessorId}->${rec.successorId}::${rec.type}`;
    map.set(key, rec);
  }
  return map;
}

const RELATIONSHIP_FIELDS = [
  { field: 'lagHrs', label: 'Lag (hrs)', get: (r: RelationshipRecord) => r.lagHrs }
] as const;

export function diffRelationships(oldXer: XER, newXer: XER): CategoryDiff<RelationshipRecord> {
  return diffByKey(buildMap(oldXer), buildMap(newXer), RELATIONSHIP_FIELDS);
}
