import { DiffTable, type DiffColumn } from './DiffTable';
import type { CalendarRecord, CategoryDiff, DiffRow } from '../lib/diff';

const pick = (r: DiffRow<CalendarRecord>, f: keyof CalendarRecord) => (r.new ?? r.old)?.[f];

const COLS: DiffColumn<CalendarRecord>[] = [
  { key: 'name',    header: 'Name',         width: 240, get: r => pick(r, 'name') },
  { key: 'type',    header: 'Type',         width: 140, get: r => pick(r, 'type') },
  { key: 'default', header: 'Default',      width: 90,  get: r => pick(r, 'isDefault') ? 'Yes' : 'No' },
  { key: 'hpd',     header: 'Hours / Day',  width: 110, get: r => pick(r, 'hoursPerDay'), align: 'right' }
];

export function CalendarsTab({ diff }: { diff: CategoryDiff<CalendarRecord> }) {
  return <DiffTable diff={diff} columns={COLS} emptyMessage="No matching calendars." />;
}
