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
import { buildMergedXer, decisionCounts, emptyDecisions, type DecisionState, type Decision } from './lib/merge';
import {
  computeThreeWay, applyThreeWay, emptyResolutions, unresolvedCount,
  type ResolutionState, type RowResolution, type FieldResolution, type ThreeWayResult
} from './lib/threeway';

type Tab = 'overview' | 'activities' | 'relationships' | 'wbs' | 'resources' | 'calendars' | 'conflicts';
type Category = 'activities' | 'relationships';

export default function App() {
  const [baseline, setBaseline] = useState<LoadedXer | null>(null);
  const [revised, setRevised] = useState<LoadedXer | null>(null);
  const [target, setTarget] = useState<LoadedXer | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionState>(() => emptyDecisions());
  const [resolutions, setResolutions] = useState<ResolutionState>(() => emptyResolutions());
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [activeDropTarget, setActiveDropTarget] = useState<DropTargetSlot | null>(null);

  const baselineSummary: FileSummary | null = useMemo(
    () => (baseline ? safeSummarize(baseline) : null),
    [baseline]
  );
  const revisedSummary: FileSummary | null = useMemo(
    () => (revised ? safeSummarize(revised) : null),
    [revised]
  );

  const diff: DiffResult | null = useMemo(() => {
    if (!baseline || !revised) return null;
    try {
      setError(null);
      return diffXer(baseline.xer, revised.xer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [baseline, revised]);

  const threeWay: ThreeWayResult | null = useMemo(() => {
    if (!baseline || !revised || !target) return null;
    try {
      return computeThreeWay(baseline.xer, revised.xer, target.xer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [baseline, revised, target]);

  // Reset decisions / resolutions whenever the input set changes.
  useMemo(() => {
    setDecisions(emptyDecisions());
    setResolutions(emptyResolutions());
    setExportStatus(null);
  }, [baseline?.path, revised?.path, target?.path]);

  // ---------- Decision toggles (2-way) -------------------------------------

  const toggleActivityDecision = useCallback((key: string) => {
    setDecisions(prev => {
      const next: DecisionState = {
        activities: new Map(prev.activities),
        relationships: prev.relationships
      };
      const cur: Decision = next.activities.get(key) ?? 'accept';
      next.activities.set(key, cur === 'accept' ? 'reject' : 'accept');
      return next;
    });
  }, []);

  const toggleRelationshipDecision = useCallback((key: string) => {
    setDecisions(prev => {
      const next: DecisionState = {
        activities: prev.activities,
        relationships: new Map(prev.relationships)
      };
      const cur: Decision = next.relationships.get(key) ?? 'accept';
      next.relationships.set(key, cur === 'accept' ? 'reject' : 'accept');
      return next;
    });
  }, []);

  const bulkSetActivityDecisions = useCallback((keys: string[], decision: Decision) => {
    setDecisions(prev => {
      const next: DecisionState = {
        activities: new Map(prev.activities),
        relationships: prev.relationships
      };
      for (const k of keys) next.activities.set(k, decision);
      return next;
    });
  }, []);

  const bulkSetRelationshipDecisions = useCallback((keys: string[], decision: Decision) => {
    setDecisions(prev => {
      const next: DecisionState = {
        activities: prev.activities,
        relationships: new Map(prev.relationships)
      };
      for (const k of keys) next.relationships.set(k, decision);
      return next;
    });
  }, []);

  // ---------- Resolution updates (3-way) -----------------------------------

  const setRowResolution = useCallback((category: Category, key: string, res: RowResolution | undefined) => {
    setResolutions(prev => {
      const rowMapKey = category === 'activities' ? 'activityRows' : 'relationshipRows';
      const next: ResolutionState = {
        ...prev,
        [rowMapKey]: new Map(prev[rowMapKey])
      };
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
    if (!baseline) return 'baseline';
    if (!revised)  return 'revised';
    if (!target)   return 'target';
    return 'baseline'; // all filled — first drop replaces baseline
  }, [baseline, revised, target]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let mounted = true;

    async function loadInto(slot: DropTargetSlot, path: string) {
      try {
        const loaded = await loadXerFromPath(path);
        if (slot === 'baseline') setBaseline(loaded);
        else if (slot === 'revised') setRevised(loaded);
        else setTarget(loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    (async () => {
      try {
        const unlisten = await getCurrentWindow().onDragDropEvent(event => {
          const p = event.payload as any;
          const type: string = p?.type;
          if (type === 'over' || type === 'enter') {
            setActiveDropTarget(predictedDropTarget);
          } else if (type === 'leave') {
            setActiveDropTarget(null);
          } else if (type === 'drop') {
            const paths: string[] = (p.paths ?? []).filter((s: string) => s.toLowerCase().endsWith('.xer'));
            setActiveDropTarget(null);
            if (paths.length === 0) return;
            if (paths.length === 1) {
              loadInto(predictedDropTarget, paths[0]);
            } else {
              // Fill empties in order, then baseline as a last resort.
              const slots: DropTargetSlot[] = [];
              if (!baseline) slots.push('baseline');
              if (!revised)  slots.push('revised');
              if (!target)   slots.push('target');
              while (slots.length < paths.length) slots.push('baseline');
              for (let i = 0; i < Math.min(paths.length, slots.length); i++) {
                loadInto(slots[i], paths[i]);
              }
            }
          }
        });
        if (mounted) cleanup = unlisten;
        else unlisten();
      } catch {
        // outside Tauri
      }
    })();

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [predictedDropTarget, baseline, revised, target]);

  // ---------- Export -------------------------------------------------------

  async function onExport() {
    if (isExporting) return;
    if (threeWay && baseline && revised && target) {
      await onExportThreeWay();
    } else if (diff && baseline && revised) {
      await onExportTwoWay();
    }
  }

  async function onExportTwoWay() {
    if (!baseline || !revised || !diff) return;
    setIsExporting(true);
    setExportStatus('Re-parsing files…');
    try {
      await new Promise(r => setTimeout(r, 0));
      const { xer: merged, stats } = buildMergedXer(baseline.text, revised.text, diff, decisions);
      setExportStatus('Choose where to save…');
      await new Promise(r => setTimeout(r, 0));
      const defaultName = revised.fileName.replace(/\.xer$/i, '') + '-merged.xer';
      const written = await saveXer(merged, defaultName);
      if (written) {
        const r = stats.activities.reverted + stats.relationships.reverted;
        setExportStatus(`Saved (${r} change${r === 1 ? '' : 's'} reverted) → ${written}`);
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
    if (!baseline || !revised || !target || !threeWay) return;
    setIsExporting(true);
    setExportStatus('Applying changes to target…');
    try {
      await new Promise(r => setTimeout(r, 0));
      const { xer: merged, stats } = applyThreeWay(
        baseline.text, revised.text, target.text, threeWay, resolutions
      );
      setExportStatus('Choose where to save…');
      await new Promise(r => setTimeout(r, 0));
      const defaultName = target.fileName.replace(/\.xer$/i, '') + '-patched.xer';
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

  function swap() {
    setBaseline(revised);
    setRevised(baseline);
  }

  // ---------- Derived ------------------------------------------------------

  const decCounts = diff ? decisionCounts(diff, decisions) : { accepted: 0, rejected: 0 };
  const unresolved = threeWay ? unresolvedCount(threeWay, resolutions) : 0;

  const exportSummary: ExportSummary = threeWay
    ? { threeWay: {
        clean:      threeWay.totals.clean,
        noOp:       threeWay.totals.noOp,
        conflicts:  threeWay.totals.conflicts,
        unresolved
      } }
    : { twoWay: { accepted: decCounts.accepted, rejected: decCounts.rejected } };

  // ---------- Render -------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-bg-base">
      <FilePickerBar
        baseline={baseline}
        revised={revised}
        target={target}
        onBaselineChange={setBaseline}
        onRevisedChange={setRevised}
        onTargetChange={setTarget}
        onSwap={swap}
        canExport={!!diff}
        onExport={onExport}
        isExporting={isExporting}
        exportStatus={exportStatus}
        exportSummary={exportSummary}
        activeDropTarget={activeDropTarget}
      />
      <Tabs
        tab={tab}
        setTab={setTab}
        diff={diff}
        threeWay={threeWay}
        unresolved={unresolved}
        hasFiles={!!(baseline || revised)}
      />
      {error && (
        <div className="px-4 py-2 bg-red-500/10 text-red-300 text-sm border-b border-red-500/30">
          {error}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'overview' && (
          <Dashboard baseline={baselineSummary} revised={revisedSummary} diff={diff} />
        )}
        {tab === 'activities'    && diff && (
          <ActivitiesTab
            diff={diff.activities}
            decisions={threeWay ? undefined : decisions.activities}
            onToggleDecision={threeWay ? undefined : toggleActivityDecision}
            onBulkSetDecisions={threeWay ? undefined : bulkSetActivityDecisions}
          />
        )}
        {tab === 'relationships' && diff && (
          <RelationshipsTab
            diff={diff.relationships}
            decisions={threeWay ? undefined : decisions.relationships}
            onToggleDecision={threeWay ? undefined : toggleRelationshipDecision}
            onBulkSetDecisions={threeWay ? undefined : bulkSetRelationshipDecisions}
          />
        )}
        {tab === 'wbs'           && diff && <WbsTab           diff={diff.wbs} />}
        {tab === 'resources'     && diff && <ResourcesTab     diff={diff.resources} />}
        {tab === 'calendars'     && diff && <CalendarsTab     diff={diff.calendars} />}
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
            Load both Baseline and Revised XER files to see this tab.
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
