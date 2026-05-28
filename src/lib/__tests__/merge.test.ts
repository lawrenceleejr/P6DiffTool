import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { XER } from 'xer-parser';
import { diffXer } from '../diff';
import { buildMergedXer, emptyDecisions, type DecisionState } from '../merge';

function load() {
  const root = resolve(__dirname, '../../..');
  const oldText = readFileSync(resolve(root, 'test-data/sample-baseline.xer'), 'utf8');
  const newText = readFileSync(resolve(root, 'test-data/sample-revised.xer'), 'utf8');
  return { oldText, newText, oldXer: new XER(oldText), newXer: new XER(newText) };
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

function reject(state: DecisionState, kind: 'activities' | 'relationships', key: string) {
  state[kind].set(key, 'reject');
}

function findTask(xer: XER, code: string) {
  return [...xer.tasks].find(t => t.taskCode === code);
}

describe('buildMergedXer — default (all accepted) reproduces the revised file', () => {
  it('produces a merged XER whose diff against revised is empty', () => {
    const { oldText, newText, newXer } = load();
    const diff = diffXer(new XER(oldText), newXer);
    const { xer: merged, stats } = buildMergedXer(oldText, newText, diff, emptyDecisions());
    expect(stats.activities.rejected).toBe(0);
    expect(stats.relationships.rejected).toBe(0);
    const reDiff = diffXer(merged, newXer);
    expect(reDiff.activities.counts.added).toBe(0);
    expect(reDiff.activities.counts.removed).toBe(0);
    expect(reDiff.activities.counts.modified).toBe(0);
    expect(reDiff.relationships.counts.added).toBe(0);
    expect(reDiff.relationships.counts.removed).toBe(0);
    expect(reDiff.relationships.counts.modified).toBe(0);
  });
});

describe('buildMergedXer — reverting a modified activity', () => {
  it('restores A1010 original duration when rejected', () => {
    const { oldText, newText, oldXer, newXer } = load();
    const diff = diffXer(oldXer, newXer);
    const decisions = emptyDecisions();
    reject(decisions, 'activities', activityKey(diff, 'A1010'));
    const { xer: merged, stats } = buildMergedXer(oldText, newText, diff, decisions);
    expect(stats.activities.rejected).toBe(1);
    expect(stats.activities.reverted).toBe(1);
    const a1010 = findTask(merged, 'A1010');
    expect(a1010).toBeDefined();
    expect(a1010!.targetDrtn.hours).toBe(40);  // baseline value, not revised 48
  });

  it('restores A2000 original name and start when rejected', () => {
    const { oldText, newText, oldXer, newXer } = load();
    const diff = diffXer(oldXer, newXer);
    const decisions = emptyDecisions();
    reject(decisions, 'activities', activityKey(diff, 'A2000'));
    const { xer: merged } = buildMergedXer(oldText, newText, diff, decisions);
    const a2000 = findTask(merged, 'A2000');
    expect(a2000).toBeDefined();
    expect(a2000!.taskName).toBe('Pour Foundation');
    expect(a2000!.targetStartDate.format('YYYY-MM-DD')).toBe('2026-04-15');
  });

  it('restores A3000 status to TK_NotStart when rejected', () => {
    const { oldText, newText, oldXer, newXer } = load();
    const diff = diffXer(oldXer, newXer);
    const decisions = emptyDecisions();
    reject(decisions, 'activities', activityKey(diff, 'A3000'));
    const { xer: merged } = buildMergedXer(oldText, newText, diff, decisions);
    const a3000 = findTask(merged, 'A3000');
    expect(a3000!.statusCode).toBe('TK_NotStart');
  });
});

describe('buildMergedXer — reverting an added activity removes it', () => {
  it('drops A1015 (Design HVAC) from the merged output when rejected', () => {
    const { oldText, newText, oldXer, newXer } = load();
    const diff = diffXer(oldXer, newXer);
    const decisions = emptyDecisions();
    reject(decisions, 'activities', activityKey(diff, 'A1015'));
    const { xer: merged, stats } = buildMergedXer(oldText, newText, diff, decisions);
    expect(stats.activities.reverted).toBe(1);
    expect(findTask(merged, 'A1015')).toBeUndefined();
  });
});

describe('buildMergedXer — reverting a removed activity re-inserts it', () => {
  it('puts A2020 (Install Roof) back into the merged output when rejected', () => {
    const { oldText, newText, oldXer, newXer } = load();
    const diff = diffXer(oldXer, newXer);
    const decisions = emptyDecisions();
    reject(decisions, 'activities', activityKey(diff, 'A2020'));
    const { xer: merged, stats } = buildMergedXer(oldText, newText, diff, decisions);
    expect(stats.activities.reverted).toBe(1);
    const a2020 = findTask(merged, 'A2020');
    expect(a2020).toBeDefined();
    expect(a2020!.taskName).toBe('Install Roof');
    expect(a2020!.targetDrtn.hours).toBe(32);
  });
});

describe('buildMergedXer — reverting relationship changes', () => {
  it('clears the 8-hr lag added to A1010 -> A1020 when rejected', () => {
    const { oldText, newText, oldXer, newXer } = load();
    const diff = diffXer(oldXer, newXer);
    const decisions = emptyDecisions();
    reject(decisions, 'relationships', relationshipKey(diff, 'A1010', 'A1020'));
    const { xer: merged } = buildMergedXer(oldText, newText, diff, decisions);
    const tp = [...merged.taskPredecessors].find(p => {
      const pred = merged.taskById.get((p as any).predTaskId);
      const succ = merged.taskById.get((p as any).taskId);
      return pred?.taskCode === 'A1010' && succ?.taskCode === 'A1020';
    });
    expect(tp).toBeDefined();
    expect((tp as any).lag.hours).toBe(0);  // baseline lag was 0
  });

  it('drops the added A2010 -> A3000 relationship when rejected', () => {
    const { oldText, newText, oldXer, newXer } = load();
    const diff = diffXer(oldXer, newXer);
    const decisions = emptyDecisions();
    reject(decisions, 'relationships', relationshipKey(diff, 'A2010', 'A3000'));
    const { xer: merged } = buildMergedXer(oldText, newText, diff, decisions);
    const tp = [...merged.taskPredecessors].find(p => {
      const pred = merged.taskById.get((p as any).predTaskId);
      const succ = merged.taskById.get((p as any).taskId);
      return pred?.taskCode === 'A2010' && succ?.taskCode === 'A3000';
    });
    expect(tp).toBeUndefined();
  });
});

describe('buildMergedXer — round-trip serialization stays valid', () => {
  it('serialized merged XER re-parses cleanly', () => {
    const { oldText, newText, oldXer, newXer } = load();
    const diff = diffXer(oldXer, newXer);
    const decisions = emptyDecisions();
    reject(decisions, 'activities', activityKey(diff, 'A1010'));
    reject(decisions, 'activities', activityKey(diff, 'A1015'));
    reject(decisions, 'activities', activityKey(diff, 'A2020'));
    const { xer: merged } = buildMergedXer(oldText, newText, diff, decisions);
    const text = merged.toXERString({ lineEnding: '\r\n' as unknown as '\\r\\n' });
    expect(text).toMatch(/^ERMHDR/);
    expect(text.trim().endsWith('%E')).toBe(true);
    const reparsed = new XER(text);
    expect(reparsed.tasks.length).toBe(merged.tasks.length);
  });
});
