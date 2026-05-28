// 2-way merge engine: apply a branch's changes onto a trunk.
//
// Mental model:
//   trunk   - current "source of truth"; the merged output starts from this
//   branch  - file with proposed changes
//   output  - trunk with branch's accepted changes applied
//
// Without a "branch base" (the older trunk version branch was cut from),
// we can't prove provenance: a row in trunk but not in branch could be
// either "branch deleted it" or "trunk added it later." Defaults reflect
// that uncertainty by protecting trunk data:
//
//   added in branch    -> apply by default (bring branch's new row in)
//   removed in branch  -> skip  by default (keep trunk's row, safer)
//   modified in branch -> apply by default (use branch's values)
//
// The user can override per row in the Activities / Logic Apply column,
// or load a branch base for the high-fidelity 3-way engine.

import { XER } from 'xer-parser';
import type { DiffResult, DiffRow, ActivityRecord, RelationshipRecord, ChangeStatus } from './diff';

export type Decision = 'apply' | 'skip';

export interface DecisionState {
  activities: Map<string, Decision>;
  relationships: Map<string, Decision>;
}

export function emptyDecisions(): DecisionState {
  return { activities: new Map(), relationships: new Map() };
}

/** Default action per change status. Removes protect trunk data by default. */
export function defaultDecision(status: ChangeStatus): Decision {
  return status === 'removed' ? 'skip' : 'apply';
}

export interface MergeStats {
  activities:    { applied: number; skipped: number; total: number };
  relationships: { applied: number; skipped: number; total: number };
}

const TASK_FIELD_TO_COLUMN: Record<string, string> = {
  name: 'task_name', type: 'task_type', status: 'status_code',
  pctComplete: 'phys_complete_pct',
  originalDurationHrs: 'target_drtn_hr_cnt',
  remainingDurationHrs: 'remain_drtn_hr_cnt',
  targetStart: 'target_start_date', targetFinish: 'target_end_date',
  actualStart: 'act_start_date',    actualFinish: 'act_end_date',
  totalFloatHrs: 'total_float_hr_cnt', freeFloatHrs: 'free_float_hr_cnt',
  constraintType: 'cstr_type',         constraintDate: 'cstr_date'
};

const REL_FIELD_TO_COLUMN: Record<string, string> = {
  lagHrs: 'lag_hr_cnt'
};

/** Build a merged XER by starting from the trunk and selectively applying
 * the (trunk -> branch) diff. Decisions override the per-status defaults. */
export function applyBranchToTrunk(
  trunkText: string,
  branchText: string,
  diff: DiffResult,
  decisions: DecisionState
): { xer: XER; stats: MergeStats } {
  const merged    = new XER(trunkText);    // start from trunk
  const branchXer = new XER(branchText);
  const stats: MergeStats = {
    activities:    { applied: 0, skipped: 0, total: 0 },
    relationships: { applied: 0, skipped: 0, total: 0 }
  };

  for (const row of diff.activities.rows) {
    if (row.status === 'unchanged') continue;
    stats.activities.total += 1;
    const decision = decisions.activities.get(row.key) ?? defaultDecision(row.status);
    if (decision === 'skip') { stats.activities.skipped += 1; continue; }
    if (applyActivity(merged, branchXer, row)) stats.activities.applied += 1;
    else stats.activities.skipped += 1;
  }

  for (const row of diff.relationships.rows) {
    if (row.status === 'unchanged') continue;
    stats.relationships.total += 1;
    const decision = decisions.relationships.get(row.key) ?? defaultDecision(row.status);
    if (decision === 'skip') { stats.relationships.skipped += 1; continue; }
    if (applyRelationship(merged, branchXer, row)) stats.relationships.applied += 1;
    else stats.relationships.skipped += 1;
  }

  merged.refreshEntities();
  return { xer: merged, stats };
}

function applyActivity(merged: XER, branchXer: XER, row: DiffRow<ActivityRecord>): boolean {
  if (row.status === 'added' && row.new) {
    if (findTaskByCode(merged, row.new.activityId)) return false;
    return insertTaskFromBranch(merged, branchXer, row.new);
  }
  if (row.status === 'removed' && row.old) {
    const t = findTaskByCode(merged, row.old.activityId);
    return t ? merged.deleteTaskRow(t.taskId) : false;
  }
  if (row.status === 'modified' && row.new) {
    const t = findTaskByCode(merged, row.new.activityId);
    if (!t) return false;
    const patch: Record<string, string | number> = {};
    for (const f of row.fields) {
      const col = TASK_FIELD_TO_COLUMN[f.field];
      if (col) patch[col] = formatXerValue(f.newValue);
    }
    return Object.keys(patch).length > 0 && merged.updateTaskRow(t.taskId, patch);
  }
  return false;
}

function applyRelationship(merged: XER, branchXer: XER, row: DiffRow<RelationshipRecord>): boolean {
  if (row.status === 'added' && row.new) {
    if (findRelationship(merged, row.new.predecessorId, row.new.successorId, row.new.type)) return false;
    return insertRelFromBranch(merged, branchXer, row.new);
  }
  if (row.status === 'removed' && row.old) {
    const tp = findRelationship(merged, row.old.predecessorId, row.old.successorId, row.old.type);
    return tp ? merged.deleteTaskPredecessorRow(tp.taskPredId) : false;
  }
  if (row.status === 'modified' && row.new) {
    const tp = findRelationship(merged, row.new.predecessorId, row.new.successorId, row.new.type);
    if (!tp) return false;
    const patch: Record<string, string | number> = {};
    for (const f of row.fields) {
      const col = REL_FIELD_TO_COLUMN[f.field];
      if (col) patch[col] = formatXerValue(f.newValue);
    }
    return Object.keys(patch).length > 0 && merged.updateTaskPredecessorRow(tp.taskPredId, patch);
  }
  return false;
}

// ---- Insert helpers (copy raw row from branch, remap ids) ------------------

function insertTaskFromBranch(merged: XER, branchXer: XER, rec: ActivityRecord): boolean {
  const t = findTaskByCode(branchXer, rec.activityId);
  if (!t) return false;
  const values = readRow(branchXer, 'TASK', 'task_id', t.taskId);
  if (!values) return false;
  values.task_id = String(nextTaskId(merged));
  retargetProjId(merged, values);
  merged.insertTaskRow(values);
  return true;
}

function insertRelFromBranch(merged: XER, branchXer: XER, rec: RelationshipRecord): boolean {
  const tp = findRelationship(branchXer, rec.predecessorId, rec.successorId, rec.type);
  if (!tp) return false;
  const succ = findTaskByCode(merged, rec.successorId);
  const pred = findTaskByCode(merged, rec.predecessorId);
  if (!succ || !pred) return false;
  const values = readRow(branchXer, 'TASKPRED', 'task_pred_id', tp.taskPredId);
  if (!values) return false;
  values.task_pred_id = String(nextRelId(merged));
  values.task_id      = String(succ.taskId);
  values.pred_task_id = String(pred.taskId);
  retargetRelProjId(merged, values);
  merged.insertTaskPredecessorRow(values);
  return true;
}

function findTaskByCode(xer: XER, taskCode: string): any | undefined {
  for (const t of xer.tasks) if (t.taskCode === taskCode) return t;
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

function readRow(xer: XER, tableName: string, idColumn: string, id: number): Record<string, string> | undefined {
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

function retargetProjId(merged: XER, values: Record<string, string>) {
  if (merged.projects.length === 0) return;
  values.proj_id = String(merged.projects[0].projId);
}

function retargetRelProjId(merged: XER, values: Record<string, string>) {
  if (merged.projects.length === 0) return;
  const projId = String(merged.projects[0].projId);
  values.proj_id      = projId;
  values.pred_proj_id = projId;
}

function formatXerValue(v: unknown): string | number {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Y' : 'N';
  return String(v);
}

// ---- UI helpers ------------------------------------------------------------

export function decisionCounts(diff: DiffResult, decisions: DecisionState): { apply: number; skip: number } {
  let apply = 0, skip = 0;
  for (const row of diff.activities.rows) {
    if (row.status === 'unchanged') continue;
    const d = decisions.activities.get(row.key) ?? defaultDecision(row.status);
    if (d === 'apply') apply++; else skip++;
  }
  for (const row of diff.relationships.rows) {
    if (row.status === 'unchanged') continue;
    const d = decisions.relationships.get(row.key) ?? defaultDecision(row.status);
    if (d === 'apply') apply++; else skip++;
  }
  return { apply, skip };
}
