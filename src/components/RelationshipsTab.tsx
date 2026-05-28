import { DiffTable, type DiffColumn } from './DiffTable';
import type { RelationshipRecord, CategoryDiff, DiffRow } from '../lib/diff';

const pick = (r: DiffRow<RelationshipRecord>, f: keyof RelationshipRecord) =>
  (r.new ?? r.old)?.[f];

const COLS: DiffColumn<RelationshipRecord>[] = [
  { key: 'pred', header: 'Predecessor', width: 130, get: r => pick(r, 'predecessorId') },
  { key: 'succ', header: 'Successor',   width: 130, get: r => pick(r, 'successorId') },
  { key: 'type', header: 'Type',        width: 100, get: r => formatType(pick(r, 'type') as string | undefined) },
  { key: 'lag',  header: 'Lag (h)',     width: 90,  get: r => pick(r, 'lagHrs'), align: 'right' }
];

function formatType(t?: string): string | undefined {
  if (!t) return undefined;
  switch (t) {
    case 'PR_FS': return 'FS';
    case 'PR_SS': return 'SS';
    case 'PR_FF': return 'FF';
    case 'PR_SF': return 'SF';
    default: return t;
  }
}

export function RelationshipsTab({ diff }: { diff: CategoryDiff<RelationshipRecord> }) {
  return <DiffTable diff={diff} columns={COLS} emptyMessage="No matching relationships." />;
}
