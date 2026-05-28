import type { XER } from 'xer-parser';
import type { DiffResult } from './types';
import { diffActivities } from './activities';
import { diffRelationships } from './relationships';
import { diffWbs } from './wbs';
import { diffResources, diffAssignments } from './resources';
import { diffCalendars } from './calendars';
import { diffProject } from './project';

export * from './types';
export { toActivityRecord } from './activities';

/** Compute the full diff between an old (baseline) and new (revised) XER. */
export function diffXer(oldXer: XER, newXer: XER): DiffResult {
  return {
    activities: diffActivities(oldXer, newXer),
    relationships: diffRelationships(oldXer, newXer),
    wbs: diffWbs(oldXer, newXer),
    resources: diffResources(oldXer, newXer),
    assignments: diffAssignments(oldXer, newXer),
    calendars: diffCalendars(oldXer, newXer),
    project: diffProject(oldXer, newXer)
  };
}
