// Diff data model.
//
// All UI and diff logic consumes these plain record types; mapping from
// xer-parser's entities to these records lives in the individual diff/*.ts
// files. Keeping the UI ignorant of the parser library makes V2 (mutation +
// merged-XER export) a localized change and keeps the diff engine testable
// in isolation.

export type ChangeStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface FieldDiff {
  field: string;        // machine name, e.g. "targetStart"
  label: string;        // human-readable label, e.g. "Planned Start"
  oldValue: unknown;
  newValue: unknown;
}

export interface DiffRow<T> {
  key: string;          // stable identity (e.g. activityId)
  status: ChangeStatus;
  old?: T;
  new?: T;
  fields: FieldDiff[];  // populated only for `modified`
}

export interface CategoryDiff<T> {
  rows: DiffRow<T>[];
  counts: Record<ChangeStatus, number>;
}

// ---- Entity record types ----------------------------------------------------

export interface ActivityRecord {
  activityId: string;          // TASK.task_code
  projectShortName: string;    // PROJECT.proj_short_name
  name: string;                // TASK.task_name
  type: string;                // TASK.task_type (TT_Task / TT_Mile / TT_FinMile / TT_WBS / TT_LOE / TT_Rsrc)
  status: string;              // TASK.status_code (TK_NotStart / TK_Active / TK_Complete)
  pctComplete?: number;        // TASK.phys_complete_pct (0..100)
  originalDurationHrs?: number;// TASK.target_drtn_hr_cnt
  remainingDurationHrs?: number;// TASK.remain_drtn_hr_cnt
  targetStart?: string;        // TASK.target_start_date
  targetFinish?: string;       // TASK.target_end_date
  actualStart?: string;        // TASK.act_start_date
  actualFinish?: string;       // TASK.act_end_date
  totalFloatHrs?: number;      // TASK.total_float_hr_cnt
  freeFloatHrs?: number;       // TASK.free_float_hr_cnt
  constraintType?: string;     // TASK.cstr_type
  constraintDate?: string;     // TASK.cstr_date
  calendarName?: string;       // joined from CALENDAR.clndr_name
  wbsPath?: string;            // joined PROJWBS path
}

export interface RelationshipRecord {
  predecessorId: string;       // TASK.task_code of predecessor
  successorId: string;         // TASK.task_code of successor
  type: string;                // TASKPRED.pred_type (PR_FS / PR_SS / PR_FF / PR_SF)
  lagHrs?: number;             // TASKPRED.lag_hr_cnt
  projectShortName: string;
}

export interface WbsRecord {
  path: string;                // "/proj/level1/level2" — joined short names
  shortName: string;           // PROJWBS.wbs_short_name (the leaf)
  name: string;                // PROJWBS.wbs_name
  projectShortName: string;
}

export interface ResourceRecord {
  resourceId: string;          // RSRC.rsrc_short_name
  name: string;                // RSRC.rsrc_name
  type: string;                // RSRC.rsrc_type
  calendarName?: string;
}

export interface AssignmentRecord {
  activityId: string;
  resourceId: string;
  projectShortName: string;
  budgetedUnits?: number;
  actualUnits?: number;
  remainingUnits?: number;
}

export interface CalendarRecord {
  name: string;                // CALENDAR.clndr_name
  type?: string;               // CALENDAR.clndr_type
  isDefault?: boolean;         // CALENDAR.default_flag
  hoursPerDay?: number;        // CALENDAR.day_hr_cnt
}

export interface ProjectRecord {
  shortName: string;
  name?: string;
  dataDate?: string;           // PROJECT.last_recalc_date
  plannedStart?: string;       // PROJECT.plan_start_date
  plannedFinish?: string;      // PROJECT.plan_end_date
  actualStart?: string;
  actualFinish?: string;
}

// ---- Aggregate result -------------------------------------------------------

export interface DiffResult {
  activities: CategoryDiff<ActivityRecord>;
  relationships: CategoryDiff<RelationshipRecord>;
  wbs: CategoryDiff<WbsRecord>;
  resources: CategoryDiff<ResourceRecord>;
  assignments: CategoryDiff<AssignmentRecord>;
  calendars: CategoryDiff<CalendarRecord>;
  project: CategoryDiff<ProjectRecord>;
}

// ---- Helpers ----------------------------------------------------------------

export function emptyCounts(): Record<ChangeStatus, number> {
  return { added: 0, removed: 0, modified: 0, unchanged: 0 };
}

/** Generic key-based diff. Compares records and emits classified rows.
 *
 * `fields` lists the (field, label, accessor) tuples to compare. A record
 * pair is `modified` iff at least one accessor returns differing values
 * (compared by stringified equality so dates/numbers/strings work).
 */
export function diffByKey<T>(
  oldRecords: ReadonlyMap<string, T>,
  newRecords: ReadonlyMap<string, T>,
  fields: ReadonlyArray<{ field: string; label: string; get: (r: T) => unknown }>
): CategoryDiff<T> {
  const rows: DiffRow<T>[] = [];
  const counts = emptyCounts();

  const allKeys = new Set<string>();
  for (const k of oldRecords.keys()) allKeys.add(k);
  for (const k of newRecords.keys()) allKeys.add(k);

  const sortedKeys = Array.from(allKeys).sort();

  for (const key of sortedKeys) {
    const oldRec = oldRecords.get(key);
    const newRec = newRecords.get(key);
    if (oldRec && !newRec) {
      rows.push({ key, status: 'removed', old: oldRec, fields: [] });
      counts.removed += 1;
    } else if (!oldRec && newRec) {
      rows.push({ key, status: 'added', new: newRec, fields: [] });
      counts.added += 1;
    } else if (oldRec && newRec) {
      const fieldDiffs: FieldDiff[] = [];
      for (const f of fields) {
        const ov = f.get(oldRec);
        const nv = f.get(newRec);
        if (!valuesEqual(ov, nv)) {
          fieldDiffs.push({ field: f.field, label: f.label, oldValue: ov, newValue: nv });
        }
      }
      if (fieldDiffs.length > 0) {
        rows.push({ key, status: 'modified', old: oldRec, new: newRec, fields: fieldDiffs });
        counts.modified += 1;
      } else {
        rows.push({ key, status: 'unchanged', old: oldRec, new: newRec, fields: [] });
        counts.unchanged += 1;
      }
    }
  }

  return { rows, counts };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // Normalize numbers to avoid 0 vs "0" mismatches across parsers.
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return String(a) === String(b);
}
