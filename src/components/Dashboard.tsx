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
      <div className="p-8 text-center text-slate-500">
        Choose a Baseline and a Revised XER file to begin.
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
      <h2 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">Diff Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cats.map(c => (
          <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500 mb-1">{c.label}</div>
            <div className="flex gap-3 text-sm">
              <span className="text-added-700"><b>{c.counts.added}</b> + </span>
              <span className="text-removed-700"><b>{c.counts.removed}</b> − </span>
              <span className="text-modified-700"><b>{c.counts.modified}</b> ~ </span>
              <span className="text-slate-500">{c.counts.unchanged} =</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectStatusTable({ baseline, revised }: { baseline: FileSummary | null; revised: FileSummary | null }) {
  const rows: Array<{ label: string; get: (s: FileSummary) => string | number }> = [
    { label: 'Project',                get: s => s.projectShortName || '—' },
    { label: 'Data Date',              get: s => s.dataDate ?? '—' },
    { label: 'Planned Start',          get: s => s.plannedStart ?? '—' },
    { label: 'Planned Finish',         get: s => s.plannedFinish ?? '—' },
    { label: 'Schedule % Complete',    get: s => `${s.schedulePctComplete}%` },
    { label: 'Activities (total)',     get: s => s.totalActivities },
    { label: '  Not started',          get: s => s.notStarted },
    { label: '  In progress',          get: s => s.inProgress },
    { label: '  Completed',            get: s => s.completed },
    { label: 'Milestones',             get: s => s.milestones },
    { label: 'Critical (TF ≤ 0)',      get: s => s.criticalActivities },
    { label: 'Relationships',          get: s => s.totalRelationships },
    { label: 'WBS nodes',              get: s => s.totalWbs },
    { label: 'Resources',              get: s => s.totalResources },
    { label: 'Calendars',              get: s => s.totalCalendars }
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">Project Status</h2>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2 w-1/3">Metric</th>
              <th className="text-left px-3 py-2 w-1/3">Baseline</th>
              <th className="text-left px-3 py-2 w-1/3">Revised</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const bv = baseline ? r.get(baseline) : null;
              const rv = revised ? r.get(revised) : null;
              const differs = bv != null && rv != null && String(bv) !== String(rv);
              return (
                <tr key={r.label} className={`border-t border-slate-100 ${differs ? 'bg-modified-50' : ''}`}>
                  <td className="px-3 py-1.5 text-slate-600 whitespace-pre">{r.label}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-900">{bv ?? <span className="text-slate-400">—</span>}</td>
                  <td className={`px-3 py-1.5 font-mono ${differs ? 'text-modified-700 font-semibold' : 'text-slate-900'}`}>{rv ?? <span className="text-slate-400">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
