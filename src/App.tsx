import { useMemo, useState, useCallback } from 'react';
import { FilePickerBar } from './components/FilePickerBar';
import { Dashboard } from './components/Dashboard';
import { ActivitiesTab } from './components/ActivitiesTab';
import { RelationshipsTab } from './components/RelationshipsTab';
import { WbsTab } from './components/WbsTab';
import { ResourcesTab } from './components/ResourcesTab';
import { CalendarsTab } from './components/CalendarsTab';
import { diffXer, type DiffResult } from './lib/diff';
import { summarize, type FileSummary } from './lib/summary';
import type { LoadedXer } from './lib/xer';
import { buildMergedXer, decisionCounts, emptyDecisions, type DecisionState, type Decision } from './lib/merge';
import { saveXer } from './lib/xer';

type Tab = 'overview' | 'activities' | 'relationships' | 'wbs' | 'resources' | 'calendars';

export default function App() {
  const [baseline, setBaseline] = useState<LoadedXer | null>(null);
  const [revised, setRevised] = useState<LoadedXer | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionState>(() => emptyDecisions());
  const [exportStatus, setExportStatus] = useState<string | null>(null);

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

  // Reset decisions whenever the input files change (stale keys would be harmless
  // but the count would look misleading).
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

  async function onExport() {
    if (!baseline || !revised || !diff) return;
    setExportStatus('Building merged XER…');
    try {
      const { xer: merged, stats } = buildMergedXer(baseline.text, revised.text, diff, decisions);
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
    }
  }

  function swap() {
    setBaseline(revised);
    setRevised(baseline);
  }

  const counts = diff ? decisionCounts(diff, decisions) : { accepted: 0, rejected: 0 };

  return (
    <div className="flex flex-col h-full">
      <FilePickerBar
        baseline={baseline}
        revised={revised}
        onBaselineChange={setBaseline}
        onRevisedChange={setRevised}
        onSwap={swap}
        canExport={!!diff}
        onExport={onExport}
        exportStatus={exportStatus}
        acceptedCount={counts.accepted}
        rejectedCount={counts.rejected}
      />
      <Tabs tab={tab} setTab={setTab} diff={diff} hasFiles={!!(baseline || revised)} />
      {error && (
        <div className="px-4 py-2 bg-removed-50 text-removed-700 text-sm border-b border-removed-200">
          Diff error: {error}
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
          />
        )}
        {tab === 'relationships' && diff && (
          <RelationshipsTab
            diff={diff.relationships}
            decisions={decisions.relationships}
            onToggleDecision={toggleRelationshipDecision}
          />
        )}
        {tab === 'wbs'           && diff && <WbsTab           diff={diff.wbs} />}
        {tab === 'resources'     && diff && <ResourcesTab     diff={diff.resources} />}
        {tab === 'calendars'     && diff && <CalendarsTab     diff={diff.calendars} />}
        {tab !== 'overview' && !diff && (
          <div className="p-8 text-center text-slate-500">
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
    <div className="flex items-end border-b border-slate-200 bg-white px-2">
      {items.map(it => {
        const disabled = !hasFiles && it.id !== 'overview';
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            onClick={() => !disabled && setTab(it.id)}
            disabled={disabled}
            className={`px-4 py-2 text-sm border-b-2 ${active ? 'border-slate-900 font-semibold text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {it.label}{it.badge ? <span className="ml-1.5 text-xs text-slate-500">({it.badge})</span> : null}
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
