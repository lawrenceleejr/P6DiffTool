// V2 merge engine. Takes the diff plus a per-row decision map and produces a
// merged XER: start from a fresh parse of the revised text (so the "default"
// state = revised), then for every rejected change, revert that row back to
// the baseline's value.
//
// Why re-parse instead of clone: xer-parser doesn't expose deep clone, and
// re-parsing is cheap, deterministic, and guaranteed isolated from the live
// in-memory XER objects bound to UI state.

import { XER } from 'xer-parser';
import type { DiffResult, DiffRow, ActivityRecord, RelationshipRecord } from './diff';

export type Decision = 'accept' | 'reject';

export interface DecisionState {
  /** Map of DiffRow.key -> decision. Missing key = default = 'accept'. */
  activities: Map<string, Decision>;
  relationships: Map<string, Decision>;
}

export function emptyDecisions(): DecisionState {
  return { activities: new Map(), relationships: new Map() };
}

export interface MergeStats {
  activities: { reverted: number; rejected: number; total: number };
  relationships: { reverted: number; rejected: number; total: number };
}

const TASK_FIELD_TO_COLUMN: Record<string, string> = {
  name: 'task_name',
  type: 'task_type',
  status: 'status_code',
  pctComplete: 'phys_complete_pct',
  originalDurationHrs: 'target_drtn_hr_cnt',
  remainingDurationHrs: 'remain_drtn_hr_cnt',
  targetStart: 'target_start_date',
  targetFinish: 'target_end_date',
  actualStart: 'act_start_date',
  actualFinish: 'act_end_date',
  totalFloatHrs: 'total_float_hr_cnt',
  freeFloatHrs: 'free_float_hr_cnt',
  constraintType: 'cstr_type',
  constraintDate: 'cstr_date'
};

const RELATIONSHIP_FIELD_TO_COLUMN: Record<string, string> = {
  lagHrs: 'lag_hr_cnt'
};

export function buildMergedXer(
  oldText: string,
  newText: string,
  diff: DiffResult,
  decisions: DecisionState
): { xer: XER; stats: MergeStats } {
  const merged = new XER(newText);
  const oldXer = new XER(oldText);
  const stats: MergeStats = {
    activities: { reverted: 0, rejected: 0, total: 0 },
    relationships: { reverted: 0, rejected: 0, total: 0 }
  };

  for (const row of diff.activities.rows) {
    if (row.status === 'unchanged') continue;
    stats.activities.total += 1;
    const decision = decisions.activities.get(row.key) ?? 'accept';
    if (decision === 'accept') continue;
    stats.activities.rejected += 1;
    if (revertActivity(merged, oldXer, row)) stats.activities.reverted += 1;
  }

  for (const row of diff.relationships.rows) {
    if (row.status === 'unchanged') continue;
    stats.relationships.total += 1;
    const decision = decisions.relationships.get(row.key) ?? 'accept';
    if (decision === 'accept') continue;
    stats.relationships.rejected += 1;
    if (revertRelationship(merged, oldXer, row)) stats.relationships.reverted += 1;
  }

  merged.refreshEntities();
  return { xer: merged, stats };
}

function revertActivity(merged: XER, oldXer: XER, row: DiffRow<ActivityRecord>): boolean {
  if (row.status === 'added' && row.new) {
    const t = findTaskByCode(merged, row.new.projectShortName, row.new.activityId);
    if (!t) return false;
    return merged.deleteTaskRow(t.taskId);
  }
  if (row.status === 'removed' && row.old) {
    if (findTaskByCode(merged, row.old.projectShortName, row.old.activityId)) return false;
    const values = readTaskRow(oldXer, row.old.projectShortName, row.old.activityId);
    if (!values) return false;
    values.task_id = String(nextTaskId(merged));
    merged.insertTaskRow(values);
    return true;
  }
  if (row.status === 'modified' && row.new) {
    const t = findTaskByCode(merged, row.new.projectShortName, row.new.activityId);
    if (!t) return false;
    const patch: Record<string, string | number> = {};
    for (const f of row.fields) {
      const col = TASK_FIELD_TO_COLUMN[f.field];
      if (col) patch[col] = formatXerValue(f.oldValue);
    }
    if (Object.keys(patch).length === 0) return false;
    return merged.updateTaskRow(t.taskId, patch);
  }
  return false;
}

function revertRelationship(merged: XER, oldXer: XER, row: DiffRow<RelationshipRecord>): boolean {
  if (row.status === 'added' && row.new) {
    const tp = findRelationship(merged, row.new.predecessorId, row.new.successorId, row.new.type);
    if (!tp) return false;
    return merged.deleteTaskPredecessorRow(tp.taskPredId);
  }
  if (row.status === 'removed' && row.old) {
    if (findRelationship(merged, row.old.predecessorId, row.old.successorId, row.old.type)) return false;
    const succ = findTaskByCode(merged, row.old.projectShortName, row.old.successorId);
    const pred = findTaskByCode(merged, row.old.projectShortName, row.old.predecessorId);
    if (!succ || !pred) return false;
    const values = readRelationshipRow(oldXer, row.old.predecessorId, row.old.successorId, row.old.type);
    if (!values) return false;
    values.task_pred_id = String(nextRelId(merged));
    values.task_id = String(succ.taskId);
    values.pred_task_id = String(pred.taskId);
    merged.insertTaskPredecessorRow(values);
    return true;
  }
  if (row.status === 'modified' && row.new) {
    const tp = findRelationship(merged, row.new.predecessorId, row.new.successorId, row.new.type);
    if (!tp) return false;
    const patch: Record<string, string | number> = {};
    for (const f of row.fields) {
      const col = RELATIONSHIP_FIELD_TO_COLUMN[f.field];
      if (col) patch[col] = formatXerValue(f.oldValue);
    }
    if (Object.keys(patch).length === 0) return false;
    return merged.updateTaskPredecessorRow(tp.taskPredId, patch);
  }
  return false;
}

// ---- Lookups ----------------------------------------------------------------

function findTaskByCode(xer: XER, projectShortName: string, taskCode: string): any | undefined {
  for (const t of xer.tasks) {
    if (t.taskCode === taskCode && (t.project as any)?.projShortName === projectShortName) return t;
  }
  return undefined;
}

function findRelationship(xer: XER, predCode: string, succCode: string, type: string): any | undefined {
  for (const tp of xer.taskPredecessors) {
    const pred = xer.taskById.get((tp as any).predTaskId);
    const succ = xer.taskById.get((tp as any).taskId);
    if (pred?.taskCode === predCode && succ?.taskCode === succCode && (tp as any).predType === type) return tp;
  }
  return undefined;
}

function readTaskRow(xer: XER, projectShortName: string, taskCode: string): Record<string, string> | undefined {
  const t = findTaskByCode(xer, projectShortName, taskCode);
  if (!t) return undefined;
  return readRawRowById(xer, 'TASK', 'task_id', t.taskId);
}

function readRelationshipRow(xer: XER, predCode: string, succCode: string, type: string): Record<string, string> | undefined {
  const tp = findRelationship(xer, predCode, succCode, type);
  if (!tp) return undefined;
  return readRawRowById(xer, 'TASKPRED', 'task_pred_id', tp.taskPredId);
}

function readRawRowById(xer: XER, tableName: string, idColumn: string, id: number): Record<string, string> | undefined {
  const tbl = xer.tables.find(t => t.name === tableName);
  if (!tbl) return undefined;
  const idIdx = tbl.header.indexOf(idColumn);
  if (idIdx < 0) return undefined;
  const want = String(id);
  for (const row of tbl.rows) {
    if (row[idIdx] === want) {
      const out: Record<string, string> = {};
      for (let i = 0; i < tbl.header.length; i++) out[tbl.header[i]] = row[i] ?? '';
      return out;
    }
  }
  return undefined;
}

function nextTaskId(xer: XER): number {
  let max = 0;
  for (const t of xer.tasks) if (t.taskId > max) max = t.taskId;
  return max + 1;
}

function nextRelId(xer: XER): number {
  let max = 0;
  for (const tp of xer.taskPredecessors) {
    const id = (tp as any).taskPredId as number;
    if (id > max) max = id;
  }
  return max + 1;
}

function formatXerValue(v: unknown): string | number {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Y' : 'N';
  return String(v);
}

// ---- Summary ----------------------------------------------------------------

export function changeCounts(diff: DiffResult): { activities: number; relationships: number; total: number } {
  let a = 0, r = 0;
  for (const row of diff.activities.rows) if (row.status !== 'unchanged') a++;
  for (const row of diff.relationships.rows) if (row.status !== 'unchanged') r++;
  return { activities: a, relationships: r, total: a + r };
}

export function decisionCounts(diff: DiffResult, decisions: DecisionState): { accepted: number; rejected: number } {
  let accepted = 0, rejected = 0;
  for (const row of diff.activities.rows) {
    if (row.status === 'unchanged') continue;
    if ((decisions.activities.get(row.key) ?? 'accept') === 'accept') accepted++;
    else rejected++;
  }
  for (const row of diff.relationships.rows) {
    if (row.status === 'unchanged') continue;
    if ((decisions.relationships.get(row.key) ?? 'accept') === 'accept') accepted++;
    else rejected++;
  }
  return { accepted, rejected };
}
