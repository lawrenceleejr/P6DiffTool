import { DiffTable, type DiffColumn } from './DiffTable';
import type { WbsRecord, CategoryDiff, DiffRow } from '../lib/diff';

const pick = (r: DiffRow<WbsRecord>, f: keyof WbsRecord) => (r.new ?? r.old)?.[f];

const COLS: DiffColumn<WbsRecord>[] = [
  { key: 'short', header: 'Short Name', width: 130, get: r => pick(r, 'shortName') },
  { key: 'name',  header: 'Name',       width: 280, get: r => pick(r, 'name') },
  { key: 'path',  header: 'Path',       width: 350, get: r => pick(r, 'path') }
];

export function WbsTab({ diff }: { diff: CategoryDiff<WbsRecord> }) {
  return <DiffTable diff={diff} columns={COLS} emptyMessage="No matching WBS nodes." />;
}
