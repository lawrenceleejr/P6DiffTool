// Three-way merge engine: take A (baseline), B (source of changes), and C
// (target where the changes should land), and compute how each A->B delta
// applies onto C. Cleans apply automatically; conflicts wait on a user
// resolution; the result can be serialized to a merged XER.
//
// Scope (V1): Activities (TASK) and Logic (TASKPRED). WBS / Resources /
// Calendars are still shown in the regular diff but excluded from 3-way for
// now — they often involve structural joins (e.g. moving an activity
// between WBS nodes requires resolving wbs_id) that don't reduce cleanly
// to per-field decisions.

import { XER } from 'xer-parser';
import {
  type DiffRow,
  type FieldDiff,
  type ActivityRecord,
  type RelationshipRecord,
  type CategoryDiff
} from './diff';
import { diffActivities } from './diff/activities';
import { diffRelationships } from './diff/relationships';
import { toActivityRecord } from './diff/activities';
import { durationHours } from './diff/parser-utils';
import { stampTaskUpdate, stampTaskInsert } from './xer-stamp';

// ---- Types -----------------------------------------------------------------

export type ThreeWayStatus = 'clean' | 'no-op' | 'conflict';
export type ConflictKind = 'add-add' | 'modify-delete' | 'delete-modify' | 'modify-modify';

export type FieldResolution = 'take-source' | 'keep-target' | 'use-base';
export type RowResolution   = 'take-source' | 'keep-target';

export interface ThreeWayField {
  field: string;
  label: string;
  base: unknown;          // A's value
  source: unknown;        // B's value
  target: unknown;        // C's value
  status: 'apply' | 'no-op' | 'conflict';
}

export interface ThreeWayRow<T> {
  key: string;
  base?: T;
  source?: T;
  target?: T;
  changeFromBase: 'added' | 'removed' | 'modified';
  status: ThreeWayStatus;
  conflictKind?: ConflictKind;
  fields: ThreeWayField[];          // populated for modified cases
}

export interface ThreeWayCategory<T> {
  rows: ThreeWayRow<T>[];
  counts: { clean: number; noOp: number; conflicts: number };
}

export interface ThreeWayResult {
  activities: ThreeWayCategory<ActivityRecord>;
  relationships: ThreeWayCategory<RelationshipRecord>;
  totals: { clean: number; noOp: number; conflicts: number };
}

export interface ResolutionState {
  /** Per-row resolution (add-add, modify-delete, delete-modify, and the
   * row-level shortcut for modify-modify). */
  activityRows: Map<string, RowResolution>;
  /** Per-field resolution for modify-modify. Keyed by row key -> field name. */
  activityFields: Map<string, Map<string, FieldResolution>>;
  /** Row keys whose CLEAN change should be skipped (user opted out from the
   * diff tab). Conflicts live in the row/field maps above; no-ops are not
   * tracked since they're no-ops by definition. */
  activitySkipClean: Set<string>;
  relationshipRows: Map<string, RowResolution>;
  relationshipFields: Map<string, Map<string, FieldResolution>>;
  relationshipSkipClean: Set<string>;
}

export function emptyResolutions(): ResolutionState {
  return {
    activityRows: new Map(),
    activityFields: new Map(),
    activitySkipClean: new Set(),
    relationshipRows: new Map(),
    relationshipFields: new Map(),
    relationshipSkipClean: new Set()
  };
}

// ---- Engine ----------------------------------------------------------------

export function computeThreeWay(xerA: XER, xerB: XER, xerC: XER): ThreeWayResult {
  const activities = buildCategory(
    diffActivities(xerA, xerB),
    keyedActivities(xerC),
    ACTIVITY_FIELDS_FOR_EQUALITY
  );
  const relationships = buildCategory(
    diffRelationships(xerA, xerB),
    keyedRelationships(xerC),
    RELATIONSHIP_FIELDS_FOR_EQUALITY
  );
  const totals = sumCounts(activities.counts, relationships.counts);
  return { activities, relationships, totals };
}

function buildCategory<T>(
  diffAB: CategoryDiff<T>,
  cByKey: Map<string, T>,
  equalityFields: ReadonlyArray<(r: T) => unknown>
): ThreeWayCategory<T> {
  const rows: ThreeWayRow<T>[] = [];
  const counts = { clean: 0, noOp: 0, conflicts: 0 };

  for (const r of diffAB.rows) {
    if (r.status === 'unchanged') continue;
    const cVal = cByKey.get(r.key);
    let row: ThreeWayRow<T>;

    if (r.status === 'added') {
      if (!cVal) {
        row = mkRow(r, 'clean', undefined, undefined, cVal);
      } else if (recordsEqual(r.new!, cVal, equalityFields)) {
        row = mkRow(r, 'no-op', undefined, undefined, cVal);
      } else {
        row = mkRow(r, 'conflict', 'add-add', undefined, cVal);
      }
    } else if (r.status === 'removed') {
      if (!cVal) {
        row = mkRow(r, 'no-op', undefined, undefined, cVal);
      } else if (recordsEqual(r.old!, cVal, equalityFields)) {
        row = mkRow(r, 'clean', undefined, undefined, cVal);
      } else {
        row = mkRow(r, 'conflict', 'delete-modify', undefined, cVal);
      }
    } else {
      // modified — per-field analysis
      if (!cVal) {
        row = mkRow(r, 'conflict', 'modify-delete', undefined, undefined);
      } else {
        const fields = analyseFields(r.fields, cVal);
        const anyConflict = fields.some(f => f.status === 'conflict');
        const allNoOp = fields.every(f => f.status === 'no-op');
        const status: ThreeWayStatus = anyConflict ? 'conflict' : allNoOp ? 'no-op' : 'clean';
        row = mkRow(r, status, anyConflict ? 'modify-modify' : undefined, fields, cVal);
      }
    }

    rows.push(row);
    counts[row.status === 'no-op' ? 'noOp' : row.status === 'conflict' ? 'conflicts' : 'clean'] += 1;
  }

  return { rows, counts };
}

function mkRow<T>(
  diff: DiffRow<T>,
  status: ThreeWayStatus,
  conflictKind: ConflictKind | undefined,
  fields: ThreeWayField[] | undefined,
  target: T | undefined
): ThreeWayRow<T> {
  return {
    key: diff.key,
    base: diff.old,
    source: diff.new,
    target,
    changeFromBase: diff.status as 'added' | 'removed' | 'modified',
    status,
    conflictKind,
    fields: fields ?? diff.fields.map(f => ({
      field: f.field, label: f.label,
      base: f.oldValue, source: f.newValue, target: undefined,
      status: 'apply'
    }))
  };
}

function analyseFields<T>(diffFields: FieldDiff[], cVal: T): ThreeWayField[] {
  return diffFields.map(f => {
    const c = (cVal as any)[f.field];
    let status: ThreeWayField['status'];
    if (valuesEqual(c, f.oldValue))      status = 'apply';   // C is at A, can land B
    else if (valuesEqual(c, f.newValue)) status = 'no-op';   // C is already at B
    else                                 status = 'conflict';
    return { field: f.field, label: f.label, base: f.oldValue, source: f.newValue, target: c, status };
  });
}

function sumCounts(...cs: { clean: number; noOp: number; conflicts: number }[]) {
  return cs.reduce((acc, c) => ({
    clean: acc.clean + c.clean,
    noOp: acc.noOp + c.noOp,
    conflicts: acc.conflicts + c.conflicts
  }), { clean: 0, noOp: 0, conflicts: 0 });
}

// ---- Equality --------------------------------------------------------------

const ACTIVITY_FIELDS_FOR_EQUALITY: ReadonlyArray<(r: ActivityRecord) => unknown> = [
  r => r.name, r => r.type, r => r.status, r => r.pctComplete,
  r => r.originalDurationHrs, r => r.remainingDurationHrs,
  r => r.targetStart, r => r.targetFinish,
  r => r.actualStart, r => r.actualFinish,
  r => r.totalFloatHrs, r => r.freeFloatHrs,
  r => r.constraintType, r => r.constraintDate,
  r => r.calendarName, r => r.wbsPath
];

const RELATIONSHIP_FIELDS_FOR_EQUALITY: ReadonlyArray<(r: RelationshipRecord) => unknown> = [
  r => r.lagHrs
];

function recordsEqual<T>(a: T, b: T, accessors: ReadonlyArray<(r: T) => unknown>): boolean {
  for (const get of accessors) if (!valuesEqual(get(a), get(b))) return false;
  return true;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

// ---- Keyed lookups in C ----------------------------------------------------

function keyedActivities(xerC: XER): Map<string, ActivityRecord> {
  const m = new Map<string, ActivityRecord>();
  for (const t of xerC.tasks) {
    const rec = toActivityRecord(xerC, t);
    m.set(rec.activityId, rec);
  }
  return m;
}

function keyedRelationships(xerC: XER): Map<string, RelationshipRecord> {
  const m = new Map<string, RelationshipRecord>();
  for (const tp of xerC.taskPredecessors) {
    const pred = xerC.taskById.get((tp as any).predTaskId);
    const succ = xerC.taskById.get((tp as any).taskId);
    if (!pred || !succ) continue;
    const project = (succ as any).project;
    const rec: RelationshipRecord = {
      predecessorId: String(pred.taskCode ?? ''),
      successorId:   String(succ.taskCode ?? ''),
      type:          String((tp as any).predType ?? ''),
      lagHrs:        durationHours((tp as any).lag),
      projectShortName: String(project?.projShortName ?? '')
    };
    m.set(`${rec.predecessorId}->${rec.successorId}::${rec.type}`, rec);
  }
  return m;
}

// ---- Apply: produce a merged XER starting from C ---------------------------

export interface ApplyStats {
  applied: number;
  skipped: number;
  unresolvedConflicts: number;
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

export function applyThreeWay(
  baseText: string,
  sourceText: string,
  targetText: string,
  threeWay: ThreeWayResult,
  resolutions: ResolutionState,
  operator: string = ''
): { xer: XER; stats: ApplyStats } {
  const merged = new XER(targetText);     // start from C
  const xerA = new XER(baseText);
  const xerB = new XER(sourceText);
  const stats: ApplyStats = { applied: 0, skipped: 0, unresolvedConflicts: 0 };

  for (const row of threeWay.activities.rows) {
    const r = applyActivityRow(merged, xerA, xerB, row,
      resolutions.activityRows.get(row.key),
      resolutions.activityFields.get(row.key) ?? new Map(),
      resolutions.activitySkipClean.has(row.key),
      operator);
    bump(stats, r);
  }
  for (const row of threeWay.relationships.rows) {
    const r = applyRelationshipRow(merged, xerA, xerB, row,
      resolutions.relationshipRows.get(row.key),
      resolutions.relationshipFields.get(row.key) ?? new Map(),
      resolutions.relationshipSkipClean.has(row.key));
    bump(stats, r);
  }

  merged.refreshEntities();
  return { xer: merged, stats };
}

function bump(stats: ApplyStats, r: 'applied' | 'skipped' | 'unresolved') {
  if (r === 'applied')       stats.applied += 1;
  else if (r === 'skipped')  stats.skipped += 1;
  else                       stats.unresolvedConflicts += 1;
}

function applyActivityRow(
  merged: XER, _xerA: XER, xerB: XER,
  row: ThreeWayRow<ActivityRecord>,
  rowRes: RowResolution | undefined,
  fieldRes: Map<string, FieldResolution>,
  skipClean: boolean,
  operator: string
): 'applied' | 'skipped' | 'unresolved' {
  if (row.status === 'no-op') return 'skipped';

  // Cleans: apply unless the user opted out from the diff view.
  if (row.status === 'clean') {
    if (skipClean) return 'skipped';
    if (row.changeFromBase === 'added' && row.source) {
      return insertTaskFrom(merged, xerB, row.source, operator) ? 'applied' : 'skipped';
    }
    if (row.changeFromBase === 'removed' && row.base) {
      const t = findTaskByCode(merged, row.base.activityId);
      return t && merged.deleteTaskRow(t.taskId) ? 'applied' : 'skipped';
    }
    if (row.changeFromBase === 'modified' && row.source) {
      const t = findTaskByCode(merged, row.source.activityId);
      if (!t) return 'skipped';
      const patch: Record<string, string | number> = {};
      for (const f of row.fields) {
        if (f.status === 'apply') {
          const col = TASK_FIELD_TO_COLUMN[f.field];
          if (col) patch[col] = formatXer(f.source);
        }
      }
      if (Object.keys(patch).length === 0) return 'skipped';
      stampTaskUpdate(patch, authorFromBranch(xerB, row.source.activityId), operator);
      return merged.updateTaskRow(t.taskId, patch) ? 'applied' : 'skipped';
    }
    return 'skipped';
  }

  // Conflicts: require explicit resolution.
  if (row.conflictKind === 'add-add') {
    if (rowRes === 'take-source' && row.source) {
      // delete C's add then insert B's row.
      const existing = findTaskByCode(merged, row.source.activityId);
      if (existing) merged.deleteTaskRow(existing.taskId);
      return insertTaskFrom(merged, xerB, row.source, operator) ? 'applied' : 'skipped';
    }
    if (rowRes === 'keep-target') return 'skipped';
    return 'unresolved';
  }

  if (row.conflictKind === 'modify-delete') {
    // B modified, C deleted. take-source = re-insert from B with B's values.
    if (rowRes === 'take-source' && row.source) {
      return insertTaskFrom(merged, xerB, row.source, operator) ? 'applied' : 'skipped';
    }
    if (rowRes === 'keep-target') return 'skipped';
    return 'unresolved';
  }

  if (row.conflictKind === 'delete-modify') {
    // B deleted, C modified. take-source = delete from C anyway.
    if (rowRes === 'take-source' && row.target) {
      const t = findTaskByCode(merged, row.target.activityId);
      return t && merged.deleteTaskRow(t.taskId) ? 'applied' : 'skipped';
    }
    if (rowRes === 'keep-target') return 'skipped';
    return 'unresolved';
  }

  if (row.conflictKind === 'modify-modify' && row.source) {
    // Apply per-field resolutions + auto-apply 'apply' fields.
    const t = findTaskByCode(merged, row.source.activityId);
    if (!t) return 'unresolved';
    const patch: Record<string, string | number> = {};
    let anyUnresolved = false;
    for (const f of row.fields) {
      if (f.status === 'apply') {
        const col = TASK_FIELD_TO_COLUMN[f.field];
        if (col) patch[col] = formatXer(f.source);
        continue;
      }
      if (f.status === 'no-op') continue;
      // conflict — needs explicit field resolution (or row-level shortcut)
      const chosen = fieldRes.get(f.field) ?? (rowRes === 'take-source' ? 'take-source' : rowRes === 'keep-target' ? 'keep-target' : undefined);
      if (chosen === undefined) { anyUnresolved = true; continue; }
      const col = TASK_FIELD_TO_COLUMN[f.field];
      if (!col) continue;
      const value = chosen === 'take-source' ? f.source : chosen === 'use-base' ? f.base : f.target;
      patch[col] = formatXer(value);
    }
    // Apply whatever's resolved (including clean "apply" fields) even if some
    // conflicts remain unresolved — partial application keeps the user's
    // already-resolved decisions visible in the merged output. The
    // `unresolved` status / unresolvedCount gates export at the UI layer.
    let didUpdate = false;
    if (Object.keys(patch).length > 0) {
      stampTaskUpdate(patch, authorFromBranch(xerB, row.source.activityId), operator);
      didUpdate = merged.updateTaskRow(t.taskId, patch);
    }
    if (anyUnresolved) return 'unresolved';
    return didUpdate ? 'applied' : 'skipped';
  }

  return 'skipped';
}

function authorFromBranch(xerB: XER, activityId: string): string | undefined {
  const t = findTaskByCode(xerB, activityId);
  return (t as any)?.updateUser as string | undefined;
}

function applyRelationshipRow(
  merged: XER, _xerA: XER, xerB: XER,
  row: ThreeWayRow<RelationshipRecord>,
  rowRes: RowResolution | undefined,
  fieldRes: Map<string, FieldResolution>,
  skipClean: boolean
): 'applied' | 'skipped' | 'unresolved' {
  if (row.status === 'no-op') return 'skipped';

  if (row.status === 'clean') {
    if (skipClean) return 'skipped';
    if (row.changeFromBase === 'added' && row.source) {
      return insertRelFrom(merged, xerB, row.source) ? 'applied' : 'skipped';
    }
    if (row.changeFromBase === 'removed' && row.base) {
      const tp = findRel(merged, row.base.predecessorId, row.base.successorId, row.base.type);
      return tp && merged.deleteTaskPredecessorRow(tp.taskPredId) ? 'applied' : 'skipped';
    }
    if (row.changeFromBase === 'modified' && row.source) {
      const tp = findRel(merged, row.source.predecessorId, row.source.successorId, row.source.type);
      if (!tp) return 'skipped';
      const patch: Record<string, string | number> = {};
      for (const f of row.fields) {
        if (f.status === 'apply') {
          const col = REL_FIELD_TO_COLUMN[f.field];
          if (col) patch[col] = formatXer(f.source);
        }
      }
      if (Object.keys(patch).length === 0) return 'skipped';
      return merged.updateTaskPredecessorRow(tp.taskPredId, patch) ? 'applied' : 'skipped';
    }
    return 'skipped';
  }

  if (row.conflictKind === 'add-add') {
    if (rowRes === 'take-source' && row.source) {
      const existing = findRel(merged, row.source.predecessorId, row.source.successorId, row.source.type);
      if (existing) merged.deleteTaskPredecessorRow(existing.taskPredId);
      return insertRelFrom(merged, xerB, row.source) ? 'applied' : 'skipped';
    }
    if (rowRes === 'keep-target') return 'skipped';
    return 'unresolved';
  }
  if (row.conflictKind === 'modify-delete') {
    if (rowRes === 'take-source' && row.source) {
      return insertRelFrom(merged, xerB, row.source) ? 'applied' : 'skipped';
    }
    if (rowRes === 'keep-target') return 'skipped';
    return 'unresolved';
  }
  if (row.conflictKind === 'delete-modify') {
    if (rowRes === 'take-source' && row.target) {
      const tp = findRel(merged, row.target.predecessorId, row.target.successorId, row.target.type);
      return tp && merged.deleteTaskPredecessorRow(tp.taskPredId) ? 'applied' : 'skipped';
    }
    if (rowRes === 'keep-target') return 'skipped';
    return 'unresolved';
  }
  if (row.conflictKind === 'modify-modify' && row.source) {
    const tp = findRel(merged, row.source.predecessorId, row.source.successorId, row.source.type);
    if (!tp) return 'unresolved';
    const patch: Record<string, string | number> = {};
    let anyUnresolved = false;
    for (const f of row.fields) {
      if (f.status === 'apply') {
        const col = REL_FIELD_TO_COLUMN[f.field];
        if (col) patch[col] = formatXer(f.source);
        continue;
      }
      if (f.status === 'no-op') continue;
      const chosen = fieldRes.get(f.field) ?? (rowRes === 'take-source' ? 'take-source' : rowRes === 'keep-target' ? 'keep-target' : undefined);
      if (chosen === undefined) { anyUnresolved = true; continue; }
      const col = REL_FIELD_TO_COLUMN[f.field];
      if (!col) continue;
      const value = chosen === 'take-source' ? f.source : chosen === 'use-base' ? f.base : f.target;
      patch[col] = formatXer(value);
    }
    let didUpdate = false;
    if (Object.keys(patch).length > 0) {
      didUpdate = merged.updateTaskPredecessorRow(tp.taskPredId, patch);
    }
    if (anyUnresolved) return 'unresolved';
    return didUpdate ? 'applied' : 'skipped';
  }
  return 'skipped';
}

// ---- Raw-row helpers (insert from B / A into merged) -----------------------

function insertTaskFrom(merged: XER, sourceXer: XER, rec: ActivityRecord, operator: string): boolean {
  const t = findTaskByCode(sourceXer, rec.activityId);
  if (!t) return false;
  const values = readRow(sourceXer, 'TASK', 'task_id', t.taskId);
  if (!values) return false;
  values.task_id = String(nextTaskId(merged));
  // Re-target proj_id to merged's project — source and target may have
  // different internal IDs for the same logical project (we deliberately
  // ignore project name for matching).
  if (merged.projects.length > 0) values.proj_id = String(merged.projects[0].projId);
  // values.update_user at this point is the branch's value -> taken as the
  // author by stampTaskInsert.
  stampTaskInsert(values, operator);
  merged.insertTaskRow(values);
  return true;
}

function insertRelFrom(merged: XER, sourceXer: XER, rec: RelationshipRecord): boolean {
  const tp = findRel(sourceXer, rec.predecessorId, rec.successorId, rec.type);
  if (!tp) return false;
  const succ = findTaskByCode(merged, rec.successorId);
  const pred = findTaskByCode(merged, rec.predecessorId);
  if (!succ || !pred) return false;
  const values = readRow(sourceXer, 'TASKPRED', 'task_pred_id', tp.taskPredId);
  if (!values) return false;
  values.task_pred_id = String(nextRelId(merged));
  values.task_id      = String(succ.taskId);
  values.pred_task_id = String(pred.taskId);
  if (merged.projects.length > 0) {
    const projId = String(merged.projects[0].projId);
    values.proj_id      = projId;
    values.pred_proj_id = projId;
  }
  merged.insertTaskPredecessorRow(values);
  return true;
}

function findTaskByCode(xer: XER, taskCode: string): any | undefined {
  for (const t of xer.tasks) if (t.taskCode === taskCode) return t;
  return undefined;
}

function findRel(xer: XER, predCode: string, succCode: string, type: string): any | undefined {
  for (const tp of xer.taskPredecessors) {
    const pred = xer.taskById.get((tp as any).predTaskId);
    const succ = xer.taskById.get((tp as any).taskId);
    if (pred?.taskCode === predCode && succ?.taskCode === succCode && (tp as any).predType === type) return tp;
  }
  return undefined;
}

function readRow(xer: XER, tableName: string, idCol: string, id: number): Record<string, string> | undefined {
  const tbl = xer.tables.find(t => t.name === tableName);
  if (!tbl) return undefined;
  const idIdx = tbl.header.indexOf(idCol);
  if (idIdx < 0) return undefined;
  const want = String(id);
  for (const row of tbl.rows) {
    if (row[idIdx] === want) {
      const o: Record<string, string> = {};
      for (let i = 0; i < tbl.header.length; i++) o[tbl.header[i]] = row[i] ?? '';
      return o;
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

function formatXer(v: unknown): string | number {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Y' : 'N';
  return String(v);
}

// ---- Convenience -----------------------------------------------------------

/** Sum of unresolved conflicts across categories — used to gate export. */
export function unresolvedCount(threeWay: ThreeWayResult, res: ResolutionState): number {
  let n = 0;
  for (const row of threeWay.activities.rows) {
    if (row.status !== 'conflict') continue;
    if (!isRowResolved(row, res.activityRows.get(row.key), res.activityFields.get(row.key))) n++;
  }
  for (const row of threeWay.relationships.rows) {
    if (row.status !== 'conflict') continue;
    if (!isRowResolved(row, res.relationshipRows.get(row.key), res.relationshipFields.get(row.key))) n++;
  }
  return n;
}

function isRowResolved<T>(
  row: ThreeWayRow<T>,
  rowRes: RowResolution | undefined,
  fieldRes: Map<string, FieldResolution> | undefined
): boolean {
  if (row.conflictKind !== 'modify-modify') return rowRes !== undefined;
  // modify-modify: every conflicting field must have a resolution (or a row-level shortcut)
  if (rowRes !== undefined) return true;
  if (!fieldRes) return false;
  return row.fields.every(f => f.status !== 'conflict' || fieldRes.has(f.field));
}
