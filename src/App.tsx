import { useEffect, useMemo, useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FilePickerBar, type DropTargetSlot } from './components/FilePickerBar';
import { Dashboard } from './components/Dashboard';
import { ActivitiesTab } from './components/ActivitiesTab';
import { RelationshipsTab } from './components/RelationshipsTab';
import { WbsTab } from './components/WbsTab';
import { ResourcesTab } from './components/ResourcesTab';
import { CalendarsTab } from './components/CalendarsTab';
import { diffXer, type DiffResult } from './lib/diff';
import { summarize, type FileSummary } from './lib/summary';
import { loadXerFromPath, saveXer, type LoadedXer } from './lib/xer';
import { buildMergedXer, decisionCounts, emptyDecisions, type DecisionState, type Decision } from './lib/merge';

type Tab = 'overview' | 'activities' | 'relationships' | 'wbs' | 'resources' | 'calendars';

export default function App() {
  const [baseline, setBaseline] = useState<LoadedXer | null>(null);
  const [revised, setRevised] = useState<LoadedXer | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionState>(() => emptyDecisions());
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

  useMemo(() => {
    setDecisions(emptyDecisions());
    setExportStatus(null);
  }, [baseline?.path, revised?.path]);

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

  // ---------- Drag-and-drop XER files onto the file slots ------------------
  //
  // Tauri 2's drag/drop position is window-coordinate-relative, which varies
  // by platform and decoration state — hit-testing against DOM rects is
  // unreliable. We instead pick the target slot from app state: if a slot is
  // empty, it wins; if both are filled, we replace whichever was loaded first
  // (baseline). Two-file drops fill baseline then revised in order.

  const predictedDropTarget: DropTargetSlot = baseline && !revised ? 'revised' : 'baseline';

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let mounted = true;

    async function loadInto(slot: DropTargetSlot, path: string) {
      try {
        const loaded = await loadXerFromPath(path);
        if (slot === 'baseline') setBaseline(loaded); else setRevised(loaded);
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
              // Two+ files: first -> baseline, second -> revised.
              loadInto('baseline', paths[0]);
              loadInto('revised',  paths[1]);
            }
          }
        });
        if (mounted) cleanup = unlisten;
        else unlisten();
      } catch {
        // not running under Tauri (e.g. vite dev) — drag/drop unavailable
      }
    })();

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [predictedDropTarget]);

  async function onExport() {
    if (!baseline || !revised || !diff || isExporting) return;
    setIsExporting(true);
    setExportStatus('Re-parsing files…');
    try {
      // Yield to React so the disabled button + spinner render before the
      // synchronous parse/merge/serialize work runs.
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

  function swap() {
    setBaseline(revised);
    setRevised(baseline);
  }

  const counts = diff ? decisionCounts(diff, decisions) : { accepted: 0, rejected: 0 };

  return (
    <div className="flex flex-col h-full bg-bg-base">
      <FilePickerBar
        baseline={baseline}
        revised={revised}
        onBaselineChange={setBaseline}
        onRevisedChange={setRevised}
        onSwap={swap}
        canExport={!!diff}
        onExport={onExport}
        isExporting={isExporting}
        exportStatus={exportStatus}
        acceptedCount={counts.accepted}
        rejectedCount={counts.rejected}
        activeDropTarget={activeDropTarget}
      />
      <Tabs tab={tab} setTab={setTab} diff={diff} hasFiles={!!(baseline || revised)} />
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
            decisions={decisions.activities}
            onToggleDecision={toggleActivityDecision}
            onBulkSetDecisions={bulkSetActivityDecisions}
          />
        )}
        {tab === 'relationships' && diff && (
          <RelationshipsTab
            diff={diff.relationships}
            decisions={decisions.relationships}
            onToggleDecision={toggleRelationshipDecision}
            onBulkSetDecisions={bulkSetRelationshipDecisions}
          />
        )}
        {tab === 'wbs'           && diff && <WbsTab           diff={diff.wbs} />}
        {tab === 'resources'     && diff && <ResourcesTab     diff={diff.resources} />}
        {tab === 'calendars'     && diff && <CalendarsTab     diff={diff.calendars} />}
        {tab !== 'overview' && !diff && (
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
  tab, setTab, diff, hasFiles
}: { tab: Tab; setTab: (t: Tab) => void; diff: DiffResult | null; hasFiles: boolean }) {
  const items: Array<{ id: Tab; label: string; badge?: string }> = [
    { id: 'overview',      label: 'Overview' },
    { id: 'activities',    label: 'Activities',    badge: diff ? changes(diff.activities.counts) : undefined },
    { id: 'relationships', label: 'Logic',         badge: diff ? changes(diff.relationships.counts) : undefined },
    { id: 'wbs',           label: 'WBS',           badge: diff ? changes(diff.wbs.counts) : undefined },
    { id: 'resources',     label: 'Resources',     badge: diff ? changes(diff.resources.counts) : undefined },
    { id: 'calendars',     label: 'Calendars',     badge: diff ? changes(diff.calendars.counts) : undefined }
  ];
  return (
    <div className="flex items-end border-b border-line bg-bg-surface px-2">
      {items.map(it => {
        const disabled = !hasFiles && it.id !== 'overview';
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            onClick={() => !disabled && setTab(it.id)}
            disabled={disabled}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${active ? 'border-accent text-ink-50 font-semibold' : 'border-transparent text-ink-300 hover:text-ink-100'} disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {it.label}{it.badge ? <span className="ml-1.5 text-xs text-ink-400">({it.badge})</span> : null}
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
