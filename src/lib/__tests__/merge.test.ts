import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { XER } from 'xer-parser';
import { diffXer } from '../diff';
import {
  applyBranchToTrunk, emptyDecisions, defaultDecision, decisionCounts,
  type DecisionState
} from '../merge';

// In the 2-way model:
//   trunk  (this file is treated as the source of truth - output starts from it)
//   branch (this file has the proposed changes that may land on the trunk)
// For these tests we use sample-baseline.xer as trunk and sample-revised.xer
// as branch. The diff has added=A1015, removed=A2020, modified=A1010 +
// A2000 + A3000. With *default* decisions:
//   - A1015 (added)   -> apply  (default for 'added')
//   - A2020 (removed) -> skip   (default for 'removed' — protects trunk data)
//   - A1010/A2000/A3000 (modified) -> apply (default for 'modified')

function load() {
  const root = resolve(__dirname, '../../..');
  const trunkText  = readFileSync(resolve(root, 'test-data/sample-baseline.xer'), 'utf8');
  const branchText = readFileSync(resolve(root, 'test-data/sample-revised.xer'),  'utf8');
  return { trunkText, branchText, trunk: new XER(trunkText), branch: new XER(branchText) };
}

function activityKey(diff: ReturnType<typeof diffXer>, code: string): string {
  const row = diff.activities.rows.find(r => r.key === code);
  if (!row) throw new Error(`activity ${code} not found in diff`);
  return row.key;
}

function relationshipKey(diff: ReturnType<typeof diffXer>, pred: string, succ: string): string {
  const row = diff.relationships.rows.find(r => r.key.startsWith(`${pred}->${succ}`));
  if (!row) throw new Error(`relationship ${pred}->${succ} not found in diff`);
  return row.key;
}

function override(state: DecisionState, kind: 'activities' | 'relationships', key: string, d: 'apply' | 'skip') {
  state[kind].set(key, d);
}

function findTask(xer: XER, code: string) {
  return [...xer.tasks].find(t => t.taskCode === code);
}

describe('defaultDecision — per-status defaults', () => {
  it('added defaults to apply', () => expect(defaultDecision('added')).toBe('apply'));
  it('modified defaults to apply', () => expect(defaultDecision('modified')).toBe('apply'));
  it('removed defaults to skip (protect trunk)', () => expect(defaultDecision('removed')).toBe('skip'));
});

describe('applyBranchToTrunk — defaults', () => {
  const { trunkText, branchText, trunk, branch } = load();
  const diff = diffXer(trunk, branch);

  it('adds A1015 from branch (default apply)', () => {
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, emptyDecisions());
    const a1015 = findTask(merged, 'A1015');
    expect(a1015).toBeDefined();
    expect(a1015!.taskName).toBe('Design HVAC');
  });

  it('keeps A2020 in trunk (default skip on removed)', () => {
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, emptyDecisions());
    const a2020 = findTask(merged, 'A2020');
    expect(a2020).toBeDefined();
    expect(a2020!.taskName).toBe('Install Roof');
  });

  it('applies modifications (A1010 duration 40 -> 48, A2000 rename, A3000 status)', () => {
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, emptyDecisions());
    expect(findTask(merged, 'A1010')!.targetDrtn.hours).toBe(48);
    expect(findTask(merged, 'A2000')!.taskName).toBe('Pour Foundation (Slab)');
    expect(findTask(merged, 'A3000')!.statusCode).toBe('TK_Active');
  });

  it('produces 9 activities (8 trunk + 1 branch-added)', () => {
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, emptyDecisions());
    expect(merged.tasks.length).toBe(9);
  });
});

describe('applyBranchToTrunk — overrides', () => {
  const { trunkText, branchText, trunk, branch } = load();
  const diff = diffXer(trunk, branch);

  it("skip on A1015 (added) doesn't bring the new activity in", () => {
    const decisions = emptyDecisions();
    override(decisions, 'activities', activityKey(diff, 'A1015'), 'skip');
    const { xer: merged, stats } = applyBranchToTrunk(trunkText, branchText, diff, decisions);
    expect(findTask(merged, 'A1015')).toBeUndefined();
    expect(stats.activities.skipped).toBeGreaterThan(0);
  });

  it('apply on A2020 (removed) deletes it from trunk', () => {
    const decisions = emptyDecisions();
    override(decisions, 'activities', activityKey(diff, 'A2020'), 'apply');
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, decisions);
    expect(findTask(merged, 'A2020')).toBeUndefined();
  });

  it("skip on A1010 (modified) leaves trunk's duration unchanged", () => {
    const decisions = emptyDecisions();
    override(decisions, 'activities', activityKey(diff, 'A1010'), 'skip');
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, decisions);
    expect(findTask(merged, 'A1010')!.targetDrtn.hours).toBe(40);
  });

  it('applies the 8 hr lag on A1010 -> A1020 by default', () => {
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, emptyDecisions());
    const tp = [...merged.taskPredecessors].find(p => {
      const pred = merged.taskById.get((p as any).predTaskId);
      const succ = merged.taskById.get((p as any).taskId);
      return pred?.taskCode === 'A1010' && succ?.taskCode === 'A1020';
    });
    expect(tp).toBeDefined();
    expect((tp as any).lag.hours).toBe(8);
  });

  it('skip on the lag change keeps trunk\'s 0 hr lag', () => {
    const decisions = emptyDecisions();
    override(decisions, 'relationships', relationshipKey(diff, 'A1010', 'A1020'), 'skip');
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, decisions);
    const tp = [...merged.taskPredecessors].find(p => {
      const pred = merged.taskById.get((p as any).predTaskId);
      const succ = merged.taskById.get((p as any).taskId);
      return pred?.taskCode === 'A1010' && succ?.taskCode === 'A1020';
    });
    expect((tp as any).lag.hours).toBe(0);
  });
});

describe('decisionCounts — sparse map + status-aware defaults', () => {
  const { trunk, branch } = load();
  const diff = diffXer(trunk, branch);

  it('counts the right number of applies vs skips at defaults', () => {
    const { apply, skip } = decisionCounts(diff, emptyDecisions());
    // 1 added (apply) + 1 removed (skip) + 3 modified-activities (apply) +
    // 2 added-rels (apply) + 2 removed-rels (skip) + 1 modified-rel (apply)
    expect(apply).toBe(1 + 3 + 2 + 1);
    expect(skip).toBe(1 + 2);
  });

  it('flipping an override changes the count', () => {
    const decisions = emptyDecisions();
    override(decisions, 'activities', activityKey(diff, 'A1015'), 'skip');
    const after = decisionCounts(diff, decisions);
    const before = decisionCounts(diff, emptyDecisions());
    expect(after.skip).toBe(before.skip + 1);
    expect(after.apply).toBe(before.apply - 1);
  });
});

describe('applyBranchToTrunk — round-trip', () => {
  it('serialized merged XER re-parses cleanly', () => {
    const { trunkText, branchText, trunk, branch } = load();
    const diff = diffXer(trunk, branch);
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, emptyDecisions());
    const text = merged.toXERString({ lineEnding: '\r\n' as unknown as '\\r\\n' });
    expect(text).toMatch(/^ERMHDR/);
    expect(text.trim().endsWith('%E')).toBe(true);
    expect(new XER(text).tasks.length).toBe(merged.tasks.length);
  });
});

describe('applyBranchToTrunk — TASK update_date is bumped', () => {
  // P6's XER import uses TASK.update_date to decide whether a row has
  // changed since the last sync; if we don't bump it the row's content
  // change is silently ignored on import. These tests pin the behavior.

  const { trunkText, branchText, trunk, branch } = load();
  const diff = diffXer(trunk, branch);

  function rawTaskUpdateDate(xer: XER, taskCode: string): string | undefined {
    const t = [...xer.tasks].find(x => x.taskCode === taskCode);
    if (!t) return undefined;
    const tbl = xer.tables.find(tt => tt.name === 'TASK');
    if (!tbl) return undefined;
    const idIdx  = tbl.header.indexOf('task_id');
    const updIdx = tbl.header.indexOf('update_date');
    if (idIdx < 0 || updIdx < 0) return undefined;
    const row = tbl.rows.find(r => r[idIdx] === String(t.taskId));
    return row?.[updIdx];
  }

  it("a modified activity's update_date is rewritten to 'now'", () => {
    const originalUpd = rawTaskUpdateDate(trunk, 'A1010');
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, emptyDecisions());
    const mergedUpd = rawTaskUpdateDate(merged, 'A1010');
    expect(mergedUpd).toBeDefined();
    expect(mergedUpd).not.toBe(originalUpd);
    // 'now'-like timestamp must roughly match this year, in YYYY-MM-DD HH:mm form
    expect(mergedUpd).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("an inserted activity's create_date and update_date are both set", () => {
    const { xer: merged } = applyBranchToTrunk(trunkText, branchText, diff, emptyDecisions());
    const tbl = merged.tables.find(t => t.name === 'TASK')!;
    const idIdx  = tbl.header.indexOf('task_id');
    const codeIdx = tbl.header.indexOf('task_code');
    const updIdx = tbl.header.indexOf('update_date');
    const crtIdx = tbl.header.indexOf('create_date');
    const updUserIdx = tbl.header.indexOf('update_user');
    const a1015Row = tbl.rows.find(r => r[codeIdx] === 'A1015');
    expect(a1015Row).toBeDefined();
    expect(a1015Row![updIdx]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(a1015Row![crtIdx]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(a1015Row![updUserIdx]).toBe('p6difftool');
    void idIdx;
  });
});
