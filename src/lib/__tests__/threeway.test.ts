import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { XER } from 'xer-parser';
import {
  computeThreeWay,
  applyThreeWay,
  emptyResolutions,
  unresolvedCount,
  type ThreeWayResult,
  type ResolutionState
} from '../threeway';

function load() {
  const root = resolve(__dirname, '../../..');
  const aText = readFileSync(resolve(root, 'test-data/sample-baseline.xer'), 'utf8');
  const bText = readFileSync(resolve(root, 'test-data/sample-revised.xer'),  'utf8');
  const cText = readFileSync(resolve(root, 'test-data/sample-target.xer'),   'utf8');
  return { aText, bText, cText, xerA: new XER(aText), xerB: new XER(bText), xerC: new XER(cText) };
}

function findRow(r: ThreeWayResult, kind: 'activities' | 'relationships', match: string) {
  return r[kind].rows.find(row => row.key.includes(match));
}

function findTask(xer: XER, code: string) {
  return [...xer.tasks].find(t => t.taskCode === code);
}

describe('computeThreeWay — classification', () => {
  const { xerA, xerB, xerC } = load();
  const r = computeThreeWay(xerA, xerB, xerC);

  it('A1015 add (B) vs A1015 add (C) is add-add', () => {
    const row = findRow(r, 'activities', '::A1015')!;
    expect(row.status).toBe('conflict');
    expect(row.conflictKind).toBe('add-add');
    expect((row.source as any).name).toBe('Design HVAC');
    expect((row.target as any).name).toBe('Design Plumbing');
  });

  it('A2000 modify (B) vs A2000 delete (C) is modify-delete', () => {
    const row = findRow(r, 'activities', '::A2000')!;
    expect(row.status).toBe('conflict');
    expect(row.conflictKind).toBe('modify-delete');
  });

  it('A2020 delete (B) vs A2020 modify (C) is delete-modify', () => {
    const row = findRow(r, 'activities', '::A2020')!;
    expect(row.status).toBe('conflict');
    expect(row.conflictKind).toBe('delete-modify');
    expect((row.target as any).name).toBe('Install Roof (Steel)');
  });

  it('A1010 modify (B) vs modify (C) is modify-modify with per-field detail', () => {
    const row = findRow(r, 'activities', '::A1010')!;
    expect(row.status).toBe('conflict');
    expect(row.conflictKind).toBe('modify-modify');
    const byField = Object.fromEntries(row.fields.map(f => [f.field, f]));
    expect(byField.originalDurationHrs.status).toBe('conflict');
    expect(byField.originalDurationHrs.base).toBe(40);
    expect(byField.originalDurationHrs.source).toBe(48);
    expect(byField.originalDurationHrs.target).toBe(56);
    // totalFloat: B says 16 -> 8, C is already 8 -> no-op
    expect(byField.totalFloatHrs.status).toBe('no-op');
  });

  it('A3000 modify (B) on a row C did not touch is a clean apply', () => {
    const row = findRow(r, 'activities', '::A3000')!;
    expect(row.status).toBe('clean');
    expect(row.fields.every(f => f.status === 'apply' || f.status === 'no-op')).toBe(true);
  });

  it('A1010 -> A1020 lag B(0->8), C untouched is clean', () => {
    const row = findRow(r, 'relationships', '::A1010->A1020')!;
    expect(row.status).toBe('clean');
  });

  it('A2010 -> A2020 modify (C) vs delete (B) is delete-modify (B removed it)', () => {
    const row = findRow(r, 'relationships', '::A2010->A2020')!;
    expect(row.status).toBe('conflict');
    expect(row.conflictKind).toBe('delete-modify');
    expect((row.target as any)?.lagHrs).toBe(16);
  });

  it('counts the totals correctly', () => {
    // activities: 1 clean (A3000), 0 no-op rows entirely, 4 conflicts (A1010, A1015, A2000, A2020)
    expect(r.activities.counts.conflicts).toBe(4);
    expect(r.activities.counts.clean).toBeGreaterThanOrEqual(1);
    expect(r.totals.conflicts).toBeGreaterThanOrEqual(4);
  });
});

describe('applyThreeWay — clean apply happens automatically', () => {
  const { aText, bText, cText, xerA, xerB, xerC } = load();
  const r = computeThreeWay(xerA, xerB, xerC);

  it('A3000 status moves to TK_Active on the merged target', () => {
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, emptyResolutions());
    const a3000 = findTask(merged, 'A3000');
    expect(a3000?.statusCode).toBe('TK_Active');
  });

  it('A1010 totalFloat (no-op) stays at 8 on the merged target', () => {
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, emptyResolutions());
    const a1010 = findTask(merged, 'A1010');
    expect(a1010?.totalFloat.hours).toBe(8);
  });

  it('A1010 duration stays at C value (56) because the conflict is unresolved', () => {
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, emptyResolutions());
    const a1010 = findTask(merged, 'A1010');
    expect(a1010?.targetDrtn.hours).toBe(56);
  });

  it('reports unresolved conflicts when no resolutions are given', () => {
    const n = unresolvedCount(r, emptyResolutions());
    expect(n).toBeGreaterThan(0);
    const { stats } = applyThreeWay(aText, bText, cText, r, emptyResolutions());
    expect(stats.unresolvedConflicts).toBe(n);
  });
});

describe('applyThreeWay — resolving conflicts', () => {
  const { aText, bText, cText, xerA, xerB, xerC } = load();
  const r = computeThreeWay(xerA, xerB, xerC);

  function activityKey(code: string) {
    return findRow(r, 'activities', `::${code}`)!.key;
  }
  function relationshipKey(pred: string, succ: string) {
    return findRow(r, 'relationships', `::${pred}->${succ}`)!.key;
  }

  it('add-add: take-source replaces C\'s A1015 with B\'s', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityRows.set(activityKey('A1015'), 'take-source');
    const { xer: merged, stats } = applyThreeWay(aText, bText, cText, r, res);
    expect(stats.applied).toBeGreaterThanOrEqual(1);
    const a1015 = findTask(merged, 'A1015');
    expect(a1015?.taskName).toBe('Design HVAC');
  });

  it('add-add: keep-target keeps C\'s "Design Plumbing"', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityRows.set(activityKey('A1015'), 'keep-target');
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    const a1015 = findTask(merged, 'A1015');
    expect(a1015?.taskName).toBe('Design Plumbing');
  });

  it('modify-delete: take-source re-inserts A2000 with B\'s modified name', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityRows.set(activityKey('A2000'), 'take-source');
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    const a2000 = findTask(merged, 'A2000');
    expect(a2000).toBeDefined();
    expect(a2000?.taskName).toBe('Pour Foundation (Slab)');
  });

  it('modify-delete: keep-target leaves A2000 deleted', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityRows.set(activityKey('A2000'), 'keep-target');
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    expect(findTask(merged, 'A2000')).toBeUndefined();
  });

  it('delete-modify: take-source deletes A2020 from C', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityRows.set(activityKey('A2020'), 'take-source');
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    expect(findTask(merged, 'A2020')).toBeUndefined();
  });

  it('delete-modify: keep-target keeps C\'s renamed A2020', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityRows.set(activityKey('A2020'), 'keep-target');
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    const a2020 = findTask(merged, 'A2020');
    expect(a2020?.taskName).toBe('Install Roof (Steel)');
  });

  it('modify-modify per-field: take B\'s duration on A1010', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityFields.set(activityKey('A1010'), new Map([['originalDurationHrs', 'take-source']]));
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    const a1010 = findTask(merged, 'A1010');
    expect(a1010?.targetDrtn.hours).toBe(48);
  });

  it('modify-modify per-field: use-base reverts duration to 40 on A1010', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityFields.set(activityKey('A1010'), new Map([['originalDurationHrs', 'use-base']]));
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    const a1010 = findTask(merged, 'A1010');
    expect(a1010?.targetDrtn.hours).toBe(40);
  });

  it('row-level take-source on modify-modify covers all conflicting fields', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityRows.set(activityKey('A1010'), 'take-source');
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    const a1010 = findTask(merged, 'A1010');
    expect(a1010?.targetDrtn.hours).toBe(48);
  });

  it('relationship delete-modify: take-source deletes A2010->A2020 lag in C', () => {
    const res: ResolutionState = emptyResolutions();
    res.relationshipRows.set(relationshipKey('A2010', 'A2020'), 'take-source');
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    const tp = [...merged.taskPredecessors].find(p => {
      const pred = merged.taskById.get((p as any).predTaskId);
      const succ = merged.taskById.get((p as any).taskId);
      return pred?.taskCode === 'A2010' && succ?.taskCode === 'A2020';
    });
    expect(tp).toBeUndefined();
  });

  it('unresolvedCount drops to zero once every conflict has a resolution', () => {
    const res: ResolutionState = emptyResolutions();
    for (const row of r.activities.rows) if (row.status === 'conflict') res.activityRows.set(row.key, 'take-source');
    for (const row of r.relationships.rows) if (row.status === 'conflict') res.relationshipRows.set(row.key, 'take-source');
    expect(unresolvedCount(r, res)).toBe(0);
    const { stats } = applyThreeWay(load().aText, load().bText, load().cText, r, res);
    expect(stats.unresolvedConflicts).toBe(0);
  });

  it('serialized merged XER re-parses cleanly', () => {
    const res: ResolutionState = emptyResolutions();
    res.activityRows.set(activityKey('A1015'), 'take-source');
    res.activityRows.set(activityKey('A1010'), 'take-source');
    res.activityRows.set(activityKey('A2000'), 'take-source');
    res.activityRows.set(activityKey('A2020'), 'take-source');
    res.relationshipRows.set(relationshipKey('A2010', 'A2020'), 'take-source');
    const { xer: merged } = applyThreeWay(aText, bText, cText, r, res);
    const text = merged.toXERString({ lineEnding: '\r\n' as unknown as '\\r\\n' });
    expect(text).toMatch(/^ERMHDR/);
    expect(text.trim().endsWith('%E')).toBe(true);
    expect(new XER(text).tasks.length).toBe(merged.tasks.length);
  });
});
