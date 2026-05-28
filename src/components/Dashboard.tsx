import type { FileSummary } from '../lib/summary';
import type { DiffResult } from '../lib/diff';

interface Props {
  baseline: FileSummary | null;
  revised: FileSummary | null;
  diff: DiffResult | null;
}

export function Dashboard({ baseline, revised, diff }: Props) {
  if (!baseline && !revised) {
    return (
      <div className="p-12 text-center text-ink-300">
        <div className="text-2xl font-semibold text-ink-100 mb-2">Compare two P6 schedules</div>
        <p className="text-sm text-ink-400 max-w-md mx-auto">
          Drag an <span className="font-mono text-ink-200">.xer</span> file onto the
          Baseline or Revised slot above — or click <em>Choose</em> — to begin.
          Once both are loaded the diff appears across the tabs.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {diff && <DiffSummaryCards diff={diff} />}
      <ProjectStatusTable baseline={baseline} revised={revised} />
    </div>
  );
}

function DiffSummaryCards({ diff }: { diff: DiffResult }) {
  const cats = [
    { label: 'Activities',    counts: diff.activities.counts },
    { label: 'Relationships', counts: diff.relationships.counts },
    { label: 'WBS',           counts: diff.wbs.counts },
    { label: 'Resources',     counts: diff.resources.counts },
    { label: 'Calendars',     counts: diff.calendars.counts }
  ];
  return (
    <div>
      <h2 className="text-xs font-semibold text-ink-400 mb-3 uppercase tracking-wider">Diff Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cats.map(c => {
          const total = c.counts.added + c.counts.removed + c.counts.modified;
          return (
            <div key={c.label} className="rounded-xl border border-line bg-bg-surface p-4 hover:bg-bg-raised transition-colors">
              <div className="text-xs text-ink-400 mb-2 uppercase tracking-wide">{c.label}</div>
              <div className="text-2xl font-semibold text-ink-50 mb-3">{total}</div>
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-400"><b className="text-emerald-300">{c.counts.added}</b> added</span>
                <span className="text-red-400"><b className="text-red-300">{c.counts.removed}</b> removed</span>
                <span className="text-amber-400"><b className="text-amber-300">{c.counts.modified}</b> modified</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectStatusTable({ baseline, revised }: { baseline: FileSummary | null; revised: FileSummary | null }) {
  const rows: Array<{ label: string; get: (s: FileSummary) => string | number; indent?: boolean }> = [
    { label: 'Project',                get: s => s.projectShortName || '—' },
    { label: 'Data Date',              get: s => s.dataDate ?? '—' },
    { label: 'Planned Start',          get: s => s.plannedStart ?? '—' },
    { label: 'Planned Finish',         get: s => s.plannedFinish ?? '—' },
    { label: 'Schedule % Complete',    get: s => `${s.schedulePctComplete}%` },
    { label: 'Activities (total)',     get: s => s.totalActivities },
    { label: 'Not started',            get: s => s.notStarted,        indent: true },
    { label: 'In progress',            get: s => s.inProgress,        indent: true },
    { label: 'Completed',              get: s => s.completed,         indent: true },
    { label: 'Milestones',             get: s => s.milestones },
    { label: 'Critical (TF ≤ 0)',      get: s => s.criticalActivities },
    { label: 'Relationships',          get: s => s.totalRelationships },
    { label: 'WBS nodes',              get: s => s.totalWbs },
    { label: 'Resources',              get: s => s.totalResources },
    { label: 'Calendars',              get: s => s.totalCalendars }
  ];

  return (
    <div>
      <h2 className="text-xs font-semibold text-ink-400 mb-3 uppercase tracking-wider">Project Status</h2>
      <div className="rounded-xl border border-line bg-bg-surface overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-bg-raised text-ink-300 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 w-1/3">Metric</th>
              <th className="text-left px-4 py-2.5 w-1/3">Baseline</th>
              <th className="text-left px-4 py-2.5 w-1/3">Revised</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const bv = baseline ? r.get(baseline) : null;
              const rv = revised ? r.get(revised) : null;
              const differs = bv != null && rv != null && String(bv) !== String(rv);
              return (
                <tr key={r.label} className={`border-t border-line ${differs ? 'bg-amber-500/5' : ''}`}>
                  <td className={`px-4 py-2 text-ink-300 ${r.indent ? 'pl-8' : ''}`}>{r.label}</td>
                  <td className="px-4 py-2 font-mono text-ink-100">{bv ?? <span className="text-ink-500">—</span>}</td>
                  <td className={`px-4 py-2 font-mono ${differs ? 'text-amber-300 font-semibold' : 'text-ink-100'}`}>{rv ?? <span className="text-ink-500">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
