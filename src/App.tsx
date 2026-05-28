import { useEffect, useMemo, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FilePickerBar, type DropTargetSlot, type ExportSummary } from './components/FilePickerBar';
import { Dashboard } from './components/Dashboard';
import { ActivitiesTab } from './components/ActivitiesTab';
import { RelationshipsTab } from './components/RelationshipsTab';
import { WbsTab } from './components/WbsTab';
import { ResourcesTab } from './components/ResourcesTab';
import { CalendarsTab } from './components/CalendarsTab';
import { ConflictsTab } from './components/ConflictsTab';
import { diffXer, type DiffResult } from './lib/diff';
import { summarize, type FileSummary } from './lib/summary';
import { loadXerFromPath, saveXer, type LoadedXer } from './lib/xer';
import {
  applyBranchToTrunk, decisionCounts, defaultDecision, emptyDecisions,
  type DecisionState, type Decision
} from './lib/merge';
import {
  computeThreeWay, applyThreeWay, emptyResolutions, unresolvedCount,
  type ResolutionState, type RowResolution, type FieldResolution, type ThreeWayResult
} from './lib/threeway';
import { getOsUsername } from './lib/operator';

type Tab = 'overview' | 'activities' | 'relationships' | 'wbs' | 'resources' | 'calendars' | 'conflicts';
type Category = 'activities' | 'relationships';

export default function App() {
  // Mental model:
  //   trunk      - file the user trusts as the current truth. The merged
  //                output starts from this and is what becomes the "new
  //                trunk" after export.
  //   branch     - file with proposed changes the user wants to land on trunk.
  //   branchBase - optional. The version of trunk that branch was cut from.
  //                When present, enables high-fidelity 3-way merge (every
  //                change is attributable). When absent, the engine falls
  //                back to 2-way with status-dependent defaults.
  const [trunk, setTrunk]           = useState<LoadedXer | null>(null);
  const [branch, setBranch]         = useState<LoadedXer | null>(null);
  const [branchBase, setBranchBase] = useState<LoadedXer | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionState>(() => emptyDecisions());
  const [resolutions, setResolutions] = useState<ResolutionState>(() => emptyResolutions());
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [activeDropTarget, setActiveDropTarget] = useState<DropTargetSlot | null>(null);
  // "Operator" — stamped into each merged TASK row's update_user alongside
  // the original editor's name. Defaults to the OS user, freely editable.
  const [operator, setOperator] = useState('');
  useEffect(() => { getOsUsername().then(u => setOperator(prev => prev || u)); }, []);

  const trunkSummary:  FileSummary | null = useMemo(() => (trunk  ? safeSummarize(trunk)  : null), [trunk]);
  const branchSummary: FileSummary | null = useMemo(() => (branch ? safeSummarize(branch) : null), [branch]);

  // The diff direction matches the merge direction: trunk -> branch.
  // "added" means branch has it, trunk doesn't; "removed" the opposite.
  const diff: DiffResult | null = useMemo(() => {
    if (!trunk || !branch) return null;
    try {
      setError(null);
      return diffXer(trunk.xer, branch.xer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [trunk, branch]);

  // 3-way: compute branchBase -> branch as the source delta, applied onto trunk.
  const threeWay: ThreeWayResult | null = useMemo(() => {
    if (!trunk || !branch || !branchBase) return null;
    try {
      return computeThreeWay(branchBase.xer, branch.xer, trunk.xer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [trunk, branch, branchBase]);

  // Reset decisions / resolutions whenever the input set changes.
  useMemo(() => {
    setDecisions(emptyDecisions());
    setResolutions(emptyResolutions());
    setExportStatus(null);
  }, [trunk?.path, branch?.path, branchBase?.path]);

  // ---------- 2-way decision toggles ---------------------------------------
  //
  // Decisions are stored sparsely: only explicit user overrides go in the
  // Map. The "default" decision (apply for added/modified, skip for removed)
  // is computed at read time. Toggling clears the override when the new
  // value matches the default, so the user can fully reset to defaults.

  // Toggle the Apply checkbox on a row. In 3-way mode this moves the row
  // in/out of resolutions.{activity|relationship}SkipClean (only meaningful
  // on CLEAN rows). In 2-way mode it updates the sparse decisions override.
  const toggleDecision = useCallback((category: Category, key: string) => {
    if (threeWay) {
      const tw = category === 'activities' ? threeWay.activities : threeWay.relationships;
      const row = tw.rows.find(r => r.key === key);
      if (!row || row.status !== 'clean') return;
      setResolutions(prev => {
        const setKey = category === 'activities' ? 'activitySkipClean' : 'relationshipSkipClean';
        const next: ResolutionState = { ...prev, [setKey]: new Set(prev[setKey]) };
        const s = next[setKey] as Set<string>;
        if (s.has(key)) s.delete(key); else s.add(key);
        return next;
      });
      return;
    }
    setDecisions(prev => {
      if (!diff) return prev;
      const row = diff[category].rows.find(r => r.key === key);
      if (!row) return prev;
      const def = defaultDecision(row.status);
      const cur = prev[category].get(key) ?? def;
      const next: Decision = cur === 'apply' ? 'skip' : 'apply';
      const map = new Map(prev[category]);
      if (next === def) map.delete(key); else map.set(key, next);
      return { ...prev, [category]: map };
    });
  }, [diff, threeWay]);

  // Bulk Apply all / Apply none. In 3-way mode this only touches CLEAN rows
  // (conflicts must be resolved on the Conflicts tab); in 2-way mode it
  // sets every selected row's decision per the supplied value.
  const bulkSetDecisions = useCallback((category: Category, keys: string[], decision: Decision) => {
    if (threeWay) {
      const tw = category === 'activities' ? threeWay.activities : threeWay.relationships;
      const cleanKeys = new Set(tw.rows.filter(r => r.status === 'clean').map(r => r.key));
      setResolutions(prev => {
        const setKey = category === 'activities' ? 'activitySkipClean' : 'relationshipSkipClean';
        const next: ResolutionState = { ...prev, [setKey]: new Set(prev[setKey]) };
        const s = next[setKey] as Set<string>;
        for (const k of keys) {
          if (!cleanKeys.has(k)) continue;
          if (decision === 'skip') s.add(k); else s.delete(k);
        }
        return next;
      });
      return;
    }
    setDecisions(prev => {
      if (!diff) return prev;
      const map = new Map(prev[category]);
      for (const k of keys) {
        const row = diff[category].rows.find(r => r.key === k);
        if (!row) continue;
        const def = defaultDecision(row.status);
        if (decision === def) map.delete(k); else map.set(k, decision);
      }
      return { ...prev, [category]: map };
    });
  }, [diff, threeWay]);

  // Effective Apply-checkbox state per row, passed to the diff tabs.
  //
  // In 2-way mode (no branchBase) every changed row gets a checkbox driven
  // by per-status defaults + sparse user overrides.
  //
  // In 3-way mode, only CLEAN rows get a checkbox (default = apply, user can
  // skip via resolutions.activitySkipClean). Conflicts have to go through
  // the Conflicts tab (the Apply column shows nothing for them). No-op rows
  // never get a checkbox.

  const effectiveActivityDecisions = useMemo(() => {
    const m = new Map<string, Decision>();
    if (!diff) return m;
    if (threeWay) {
      for (const row of threeWay.activities.rows) {
        if (row.status !== 'clean') continue;
        m.set(row.key, resolutions.activitySkipClean.has(row.key) ? 'skip' : 'apply');
      }
    } else {
      for (const row of diff.activities.rows) {
        if (row.status === 'unchanged') continue;
        m.set(row.key, decisions.activities.get(row.key) ?? defaultDecision(row.status));
      }
    }
    return m;
  }, [diff, threeWay, decisions.activities, resolutions.activitySkipClean]);

  const effectiveRelationshipDecisions = useMemo(() => {
    const m = new Map<string, Decision>();
    if (!diff) return m;
    if (threeWay) {
      for (const row of threeWay.relationships.rows) {
        if (row.status !== 'clean') continue;
        m.set(row.key, resolutions.relationshipSkipClean.has(row.key) ? 'skip' : 'apply');
      }
    } else {
      for (const row of diff.relationships.rows) {
        if (row.status === 'unchanged') continue;
        m.set(row.key, decisions.relationships.get(row.key) ?? defaultDecision(row.status));
      }
    }
    return m;
  }, [diff, threeWay, decisions.relationships, resolutions.relationshipSkipClean]);

  // ---------- 3-way resolution updates -------------------------------------

  const setRowResolution = useCallback((category: Category, key: string, res: RowResolution | undefined) => {
    setResolutions(prev => {
      const rowMapKey = category === 'activities' ? 'activityRows' : 'relationshipRows';
      const next: ResolutionState = { ...prev, [rowMapKey]: new Map(prev[rowMapKey]) };
      if (res === undefined) (next[rowMapKey] as Map<string, RowResolution>).delete(key);
      else (next[rowMapKey] as Map<string, RowResolution>).set(key, res);
      return next;
    });
  }, []);

  const setFieldResolution = useCallback((category: Category, key: string, field: string, res: FieldResolution | undefined) => {
    setResolutions(prev => {
      const mapKey = category === 'activities' ? 'activityFields' : 'relationshipFields';
      const next: ResolutionState = { ...prev, [mapKey]: new Map(prev[mapKey]) };
      const inner = new Map(prev[mapKey].get(key) ?? new Map<string, FieldResolution>());
      if (res === undefined) inner.delete(field);
      else inner.set(field, res);
      if (inner.size === 0) (next[mapKey] as Map<string, Map<string, FieldResolution>>).delete(key);
      else (next[mapKey] as Map<string, Map<string, FieldResolution>>).set(key, inner);
      return next;
    });
  }, []);

  const bulkResolve = useCallback((category: Category, keys: string[], res: RowResolution) => {
    setResolutions(prev => {
      const mapKey = category === 'activities' ? 'activityRows' : 'relationshipRows';
      const next: ResolutionState = { ...prev, [mapKey]: new Map(prev[mapKey]) };
      for (const k of keys) (next[mapKey] as Map<string, RowResolution>).set(k, res);
      return next;
    });
  }, []);

  // ---------- Drag-and-drop ------------------------------------------------

  const predictedDropTarget: DropTargetSlot = useMemo(() => {
    if (!trunk)      return 'trunk';
    if (!branch)     return 'branch';
    if (!branchBase) return 'branchBase';
    return 'trunk';
  }, [trunk, branch, branchBase]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let mounted = true;

    async function loadInto(slot: DropTargetSlot, path: string) {
      try {
        const loaded = await loadXerFromPath(path);
        if (slot === 'trunk') setTrunk(loaded);
        else if (slot === 'branch') setBranch(loaded);
        else setBranchBase(loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    (async () => {
      try {
        const unlisten = await getCurrentWindow().onDragDropEvent(event => {
          const p = event.payload as any;
          const type: string = p?.type;
          if (type === 'over' || type === 'enter') setActiveDropTarget(predictedDropTarget);
          else if (type === 'leave') setActiveDropTarget(null);
          else if (type === 'drop') {
            const paths: string[] = (p.paths ?? []).filter((s: string) => s.toLowerCase().endsWith('.xer'));
            setActiveDropTarget(null);
            if (paths.length === 0) return;
            if (paths.length === 1) {
              loadInto(predictedDropTarget, paths[0]);
            } else {
              // Fill empties in order: trunk, branch, branchBase.
              const slots: DropTargetSlot[] = [];
              if (!trunk)      slots.push('trunk');
              if (!branch)     slots.push('branch');
              if (!branchBase) slots.push('branchBase');
              while (slots.length < paths.length) slots.push('trunk');
              for (let i = 0; i < Math.min(paths.length, slots.length); i++) {
                loadInto(slots[i], paths[i]);
              }
            }
          }
        });
        if (mounted) cleanup = unlisten;
        else unlisten();
      } catch { /* outside Tauri */ }
    })();

    return () => { mounted = false; cleanup?.(); };
  }, [predictedDropTarget, trunk, branch, branchBase]);

  // ---------- Export -------------------------------------------------------

  async function onExport() {
    if (isExporting) return;
    if (threeWay && trunk && branch && branchBase) {
      await onExportThreeWay();
    } else if (diff && trunk && branch) {
      await onExportTwoWay();
    }
  }

  async function onExportTwoWay() {
    if (!trunk || !branch || !diff) return;
    setIsExporting(true);
    setExportStatus('Applying branch changes to trunk…');
    try {
      await new Promise(r => setTimeout(r, 0));
      const { xer: merged, stats } = applyBranchToTrunk(trunk.text, branch.text, diff, decisions, operator);
      setExportStatus('Choose where to save…');
      await new Promise(r => setTimeout(r, 0));
      const defaultName = trunk.fileName.replace(/\.xer$/i, '') + '-updated.xer';
      const written = await saveXer(merged, defaultName);
      if (written) {
        const a = stats.activities.applied + stats.relationships.applied;
        setExportStatus(`Saved (${a} change${a === 1 ? '' : 's'} applied) → ${written}`);
      } else {
        setExportStatus(null);
      }
    } catch (e) {
      setExportStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsExporting(false);
    }
  }

  async function onExportThreeWay() {
    if (!trunk || !branch || !branchBase || !threeWay) return;
    setIsExporting(true);
    setExportStatus('Applying branch changes to trunk…');
    try {
      await new Promise(r => setTimeout(r, 0));
      const { xer: merged, stats } = applyThreeWay(
        branchBase.text, branch.text, trunk.text, threeWay, resolutions, operator
      );
      setExportStatus('Choose where to save…');
      await new Promise(r => setTimeout(r, 0));
      const defaultName = trunk.fileName.replace(/\.xer$/i, '') + '-updated.xer';
      const written = await saveXer(merged, defaultName);
      if (written) {
        setExportStatus(`Saved (${stats.applied} applied, ${stats.unresolvedConflicts} unresolved) → ${written}`);
      } else {
        setExportStatus(null);
      }
    } catch (e) {
      setExportStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsExporting(false);
    }
  }

  function swapTrunkBranch() {
    setTrunk(branch);
    setBranch(trunk);
  }

  // ---------- Derived ------------------------------------------------------

  const decCounts  = diff ? decisionCounts(diff, decisions) : { apply: 0, skip: 0 };
  const unresolved = threeWay ? unresolvedCount(threeWay, resolutions) : 0;

  const exportSummary: ExportSummary = threeWay
    ? { threeWay: {
        clean:     threeWay.totals.clean,
        noOp:      threeWay.totals.noOp,
        conflicts: threeWay.totals.conflicts,
        unresolved
      } }
    : { twoWay: { apply: decCounts.apply, skip: decCounts.skip } };

  return (
    <div className="flex flex-col h-full bg-bg-base">
      <FilePickerBar
        trunk={trunk}
        branch={branch}
        branchBase={branchBase}
        onTrunkChange={setTrunk}
        onBranchChange={setBranch}
        onBranchBaseChange={setBranchBase}
        onSwap={swapTrunkBranch}
        canExport={!!diff}
        onExport={onExport}
        isExporting={isExporting}
        exportStatus={exportStatus}
        exportSummary={exportSummary}
        activeDropTarget={activeDropTarget}
        operator={operator}
        onOperatorChange={setOperator}
      />
      <Tabs
        tab={tab} setTab={setTab}
        diff={diff} threeWay={threeWay}
        unresolved={unresolved}
        hasFiles={!!(trunk || branch)}
      />
      {error && (
        <div className="px-4 py-2 bg-red-500/10 text-red-300 text-sm border-b border-red-500/30">{error}</div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'overview' && (
          <Dashboard trunk={trunkSummary} branch={branchSummary} diff={diff} />
        )}
        {tab === 'activities' && diff && (
          <ActivitiesTab
            diff={diff.activities}
            decisions={effectiveActivityDecisions}
            onToggleDecision={k => toggleDecision('activities', k)}
            onBulkSetDecisions={(keys, d) => bulkSetDecisions('activities', keys, d)}
          />
        )}
        {tab === 'relationships' && diff && (
          <RelationshipsTab
            diff={diff.relationships}
            decisions={effectiveRelationshipDecisions}
            onToggleDecision={k => toggleDecision('relationships', k)}
            onBulkSetDecisions={(keys, d) => bulkSetDecisions('relationships', keys, d)}
          />
        )}
        {tab === 'wbs'       && diff && <WbsTab       diff={diff.wbs} />}
        {tab === 'resources' && diff && <ResourcesTab diff={diff.resources} />}
        {tab === 'calendars' && diff && <CalendarsTab diff={diff.calendars} />}
        {tab === 'conflicts' && threeWay && (
          <ConflictsTab
            threeWay={threeWay}
            resolutions={resolutions}
            onSetRowResolution={setRowResolution}
            onSetFieldResolution={setFieldResolution}
            onBulkResolve={bulkResolve}
          />
        )}
        {tab !== 'overview' && tab !== 'conflicts' && !diff && (
          <div className="p-8 text-center text-ink-400">
            Load both Trunk and Branch XER files to see this tab.
          </div>
        )}
      </div>
    </div>
  );
}

function safeSummarize(loaded: LoadedXer): FileSummary | null {
  try { return summarize(loaded.xer); } catch { return null; }
}

function Tabs({
  tab, setTab, diff, threeWay, unresolved, hasFiles
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  diff: DiffResult | null;
  threeWay: ThreeWayResult | null;
  unresolved: number;
  hasFiles: boolean;
}) {
  const items: Array<{ id: Tab; label: string; badge?: string; warn?: boolean; hidden?: boolean }> = [
    { id: 'overview',      label: 'Overview' },
    { id: 'activities',    label: 'Activities',    badge: diff ? changes(diff.activities.counts) : undefined },
    { id: 'relationships', label: 'Logic',         badge: diff ? changes(diff.relationships.counts) : undefined },
    { id: 'wbs',           label: 'WBS',           badge: diff ? changes(diff.wbs.counts) : undefined },
    { id: 'resources',     label: 'Resources',     badge: diff ? changes(diff.resources.counts) : undefined },
    { id: 'calendars',     label: 'Calendars',     badge: diff ? changes(diff.calendars.counts) : undefined },
    {
      id: 'conflicts',
      label: 'Conflicts',
      badge: threeWay ? (unresolved > 0 ? `${unresolved} unresolved` : `${threeWay.totals.conflicts}`) : undefined,
      warn: unresolved > 0,
      hidden: !threeWay
    }
  ];
  return (
    <div className="flex items-end border-b border-line bg-bg-surface px-2 overflow-x-auto">
      {items.filter(i => !i.hidden).map(it => {
        const disabled = !hasFiles && it.id !== 'overview';
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            onClick={() => !disabled && setTab(it.id)}
            disabled={disabled}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${active ? 'border-accent text-ink-50 font-semibold' : 'border-transparent text-ink-300 hover:text-ink-100'} disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {it.label}{it.badge ? (
              <span className={`ml-1.5 text-xs ${it.warn ? 'text-amber-300 font-semibold' : 'text-ink-400'}`}>
                ({it.badge})
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function changes(c: { added: number; removed: number; modified: number }): string | undefined {
  const total = c.added + c.removed + c.modified;
  return total > 0 ? String(total) : undefined;
}
