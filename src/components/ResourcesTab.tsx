import { DiffTable, type DiffColumn } from './DiffTable';
import type { ResourceRecord, CategoryDiff, DiffRow } from '../lib/diff';

const pick = (r: DiffRow<ResourceRecord>, f: keyof ResourceRecord) => (r.new ?? r.old)?.[f];

const COLS: DiffColumn<ResourceRecord>[] = [
  { key: 'id',   header: 'Resource ID', width: 140, get: r => pick(r, 'resourceId') },
  { key: 'name', header: 'Name',        width: 280, get: r => pick(r, 'name') },
  { key: 'type', header: 'Type',        width: 140, get: r => formatType(pick(r, 'type') as string | undefined) },
  { key: 'cal',  header: 'Calendar',    width: 200, get: r => pick(r, 'calendarName') }
];

function formatType(t?: string): string | undefined {
  if (!t) return undefined;
  switch (t) {
    case 'RT_Labor':    return 'Labor';
    case 'RT_Mat':      return 'Material';
    case 'RT_Equip':    return 'Equipment';
    default: return t;
  }
}

export function ResourcesTab({ diff }: { diff: CategoryDiff<ResourceRecord> }) {
  return <DiffTable diff={diff} columns={COLS} emptyMessage="No matching resources." />;
}
