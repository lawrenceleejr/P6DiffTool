import { DiffTable, type DiffColumn } from './DiffTable';
import type { ActivityRecord, CategoryDiff, DiffRow } from '../lib/diff';
import type { Decision } from '../lib/merge';

const pick = (r: DiffRow<ActivityRecord>, f: keyof ActivityRecord) =>
  (r.new ?? r.old)?.[f];

const COLS: DiffColumn<ActivityRecord>[] = [
  { key: 'id',         header: 'Activity ID',  width: 110, get: r => pick(r, 'activityId') },
  { key: 'name',       header: 'Name',         width: 280, get: r => pick(r, 'name') },
  { key: 'wbs',        header: 'WBS',          width: 220, get: r => pick(r, 'wbsPath') },
  { key: 'status',     header: 'Status',       width: 100, get: r => formatStatus(pick(r, 'status') as string | undefined) },
  { key: 'pct',        header: '% Cmp',        width: 70,  get: r => pick(r, 'pctComplete'), align: 'right' },
  { key: 'dur',        header: 'Orig Dur (h)', width: 90,  get: r => pick(r, 'originalDurationHrs'), align: 'right' },
  { key: 'tstart',     header: 'Plan Start',   width: 140, get: r => pick(r, 'targetStart') },
  { key: 'tfinish',    header: 'Plan Finish',  width: 140, get: r => pick(r, 'targetFinish') },
  { key: 'astart',     header: 'Act Start',    width: 140, get: r => pick(r, 'actualStart') },
  { key: 'afinish',    header: 'Act Finish',   width: 140, get: r => pick(r, 'actualFinish') },
  { key: 'tf',         header: 'TF (h)',       width: 70,  get: r => pick(r, 'totalFloatHrs'), align: 'right' }
];

function formatStatus(s?: string): string | undefined {
  if (!s) return undefined;
  switch (s) {
    case 'TK_NotStart': return 'Not Started';
    case 'TK_Active':   return 'In Progress';
    case 'TK_Complete': return 'Completed';
    default: return s;
  }
}

export function ActivitiesTab({
  diff, decisions, onToggleDecision, onBulkSetDecisions
}: {
  diff: CategoryDiff<ActivityRecord>;
  decisions?: Map<string, Decision>;
  onToggleDecision?: (key: string) => void;
  onBulkSetDecisions?: (keys: string[], decision: Decision) => void;
}) {
  return (
    <DiffTable
      diff={diff}
      columns={COLS}
      emptyMessage="No matching activities."
      decisions={decisions}
      onToggleDecision={onToggleDecision}
      onBulkSetDecisions={onBulkSetDecisions}
    />
  );
}
