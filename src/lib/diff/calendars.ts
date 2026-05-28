import type { XER } from 'xer-parser';
import {
  diffByKey,
  type CalendarRecord,
  type CategoryDiff
} from './types';
import { num } from './parser-utils';

function buildMap(xer: XER): Map<string, CalendarRecord> {
  const map = new Map<string, CalendarRecord>();
  for (const c of xer.calendars) {
    const rec: CalendarRecord = {
      name: String((c as any).clndrName ?? ''),
      type: String((c as any).clndrType ?? ''),
      isDefault: Boolean((c as any).defaultFlag),
      hoursPerDay: num((c as any).dayHrCnt)
    };
    if (rec.name) map.set(rec.name, rec);
  }
  return map;
}

const CALENDAR_FIELDS = [
  { field: 'type', label: 'Type', get: (c: CalendarRecord) => c.type },
  { field: 'isDefault', label: 'Default', get: (c: CalendarRecord) => c.isDefault },
  { field: 'hoursPerDay', label: 'Hours / Day', get: (c: CalendarRecord) => c.hoursPerDay }
] as const;

export function diffCalendars(oldXer: XER, newXer: XER): CategoryDiff<CalendarRecord> {
  return diffByKey(buildMap(oldXer), buildMap(newXer), CALENDAR_FIELDS);
}
