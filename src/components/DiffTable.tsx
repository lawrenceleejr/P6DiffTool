import { useMemo, useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { CategoryDiff, ChangeStatus, DiffRow } from '../lib/diff';
import type { Decision } from '../lib/merge';

export interface DiffColumn<T> {
  key: string;
  header: string;
  /** Width in pixels. Used in a fixed table-layout for stable cross-WebView alignment. */
  width: number;
  /** Accessor for display in normal rows. */
  get: (row: DiffRow<T>) => unknown;
  /** Optional alignment. */
  align?: 'left' | 'right';
  /** Optional renderer for old/new comparison in expanded view. */
  format?: (value: unknown) => string;
}

interface Props<T> {
  diff: CategoryDiff<T>;
  columns: DiffColumn<T>[];
  /** What to show in the "name / id" column header when no row is matched. */
  emptyMessage?: string;
  /** Optional per-row decision state. When provided, rows with status !=
   * unchanged show an "Apply" checkbox (checked = accept, unchecked = reject). */
  decisions?: Map<string, Decision>;
  onToggleDecision?: (key: string) => void;
}

type FilterMode = 'all' | 'changes-only' | ChangeStatus;

const ROW_HEIGHT = 36;
const EXPANDED_EXTRA = 28;

export function DiffTable<T>({
  diff, columns, emptyMessage = 'No rows.', decisions, onToggleDecision
}: Props<T>) {
  const showDecision = decisions !== undefined && onToggleDecision !== undefined;
  const [filter, setFilter] = useState<FilterMode>('changes-only');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const visibleRows = useMemo(() => {
    let rows = diff.rows;
    if (filter === 'changes-only') {
      rows = rows.filter(r => r.status !== 'unchanged');
    } else if (filter !== 'all') {
      rows = rows.filter(r => r.status === filter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(r => {
        if (r.key.toLowerCase().includes(q)) return true;
        for (const c of columns) {
          const v = c.get(r);
          if (v != null && String(v).toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    return rows;
  }, [diff.rows, filter, query, columns]);

  const DECISION_WIDTH = 56;
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0) + 28 + (showDecision ? DECISION_WIDTH : 0); // +28 left status, +56 decision
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: i => {
      const row = visibleRows[i];
      const isExpanded = expanded.has(row.key);
      const extra = isExpanded ? Math.max(row.fields.length, 1) * EXPANDED_EXTRA + 12 : 0;
      return ROW_HEIGHT + extra;
    },
    overscan: 8,
    getItemKey: i => visibleRows[i].key
  });

  function toggleExpanded(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    virtualizer.measure();
  }

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        diff={diff}
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        visibleCount={visibleRows.length}
      />
      <div ref={parentRef} className="flex-1 overflow-auto bg-white">
        <div style={{ width: totalWidth, position: 'relative' }}>
          <Header columns={columns} showDecision={showDecision} decisionWidth={DECISION_WIDTH} />
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vi => {
              const row = visibleRows[vi.index];
              const isExpanded = expanded.has(row.key);
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`
                  }}
                >
                  <Row
                    row={row}
                    columns={columns}
                    expanded={isExpanded}
                    onToggle={() => toggleExpanded(row.key)}
                    decision={showDecision ? (decisions!.get(row.key) ?? 'accept') : undefined}
                    onToggleDecision={showDecision ? () => onToggleDecision!(row.key) : undefined}
                    decisionWidth={showDecision ? DECISION_WIDTH : 0}
                  />
                </div>
              );
            })}
            {visibleRows.length === 0 && (
              <div className="p-6 text-center text-slate-500">{emptyMessage}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toolbar<T>({
  diff, filter, onFilter, query, onQuery, visibleCount
}: {
  diff: CategoryDiff<T>;
  filter: FilterMode;
  onFilter: (m: FilterMode) => void;
  query: string;
  onQuery: (q: string) => void;
  visibleCount: number;
}) {
  const total = diff.rows.length;
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-slate-50 text-sm">
      <div className="flex gap-1">
        <FilterChip label={`Changes (${diff.counts.added + diff.counts.removed + diff.counts.modified})`} active={filter === 'changes-only'} onClick={() => onFilter('changes-only')} />
        <FilterChip label={`All (${total})`} active={filter === 'all'} onClick={() => onFilter('all')} />
        <FilterChip label={`+${diff.counts.added}`} active={filter === 'added'} onClick={() => onFilter('added')} accent="added" />
        <FilterChip label={`−${diff.counts.removed}`} active={filter === 'removed'} onClick={() => onFilter('removed')} accent="removed" />
        <FilterChip label={`~${diff.counts.modified}`} active={filter === 'modified'} onClick={() => onFilter('modified')} accent="modified" />
      </div>
      <input
        value={query}
        onChange={e => onQuery(e.target.value)}
        placeholder="Filter…"
        className="ml-2 px-2 py-1 text-sm border border-slate-300 rounded w-48 focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
      <div className="ml-auto text-xs text-slate-500">{visibleCount} shown</div>
    </div>
  );
}

function FilterChip({
  label, active, onClick, accent
}: { label: string; active: boolean; onClick: () => void; accent?: 'added' | 'removed' | 'modified' }) {
  const tints =
    accent === 'added' ? 'border-added-500 text-added-700' :
    accent === 'removed' ? 'border-removed-500 text-removed-700' :
    accent === 'modified' ? 'border-modified-500 text-modified-700' :
    'border-slate-300 text-slate-700';
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded border ${tints} ${active ? 'bg-slate-200 font-semibold' : 'bg-white hover:bg-slate-100'}`}
    >
      {label}
    </button>
  );
}

function Header<T>({
  columns, showDecision, decisionWidth
}: { columns: DiffColumn<T>[]; showDecision: boolean; decisionWidth: number }) {
  return (
    <div
      className="flex bg-slate-100 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600 font-semibold"
      style={{ position: 'sticky', top: 0, zIndex: 1, height: ROW_HEIGHT }}
    >
      <div style={{ width: 28 }} />
      {showDecision && (
        <div className="px-2 py-2 text-center" style={{ width: decisionWidth }} title="Apply this change to the merged output?">
          Apply
        </div>
      )}
      {columns.map(c => (
        <div
          key={c.key}
          className="px-2 py-2 truncate"
          style={{ width: c.width, textAlign: c.align ?? 'left' }}
          title={c.header}
        >
          {c.header}
        </div>
      ))}
    </div>
  );
}

function Row<T>({
  row, columns, expanded, onToggle, decision, onToggleDecision, decisionWidth
}: {
  row: DiffRow<T>;
  columns: DiffColumn<T>[];
  expanded: boolean;
  onToggle: () => void;
  decision?: Decision;
  onToggleDecision?: () => void;
  decisionWidth: number;
}) {
  const cls = `row-${row.status}`;
  const showDecisionCell = decision !== undefined && row.status !== 'unchanged';
  return (
    <div className={`${cls} hover:bg-slate-100`}>
      <div
        className="flex items-center cursor-pointer"
        style={{ height: ROW_HEIGHT }}
        onClick={row.status === 'modified' ? onToggle : undefined}
      >
        <div className="flex items-center justify-center text-slate-400 text-xs" style={{ width: 28 }}>
          {row.status === 'modified' ? (expanded ? '▼' : '▶') : statusSymbol(row.status)}
        </div>
        {decisionWidth > 0 && (
          <div
            className="flex items-center justify-center"
            style={{ width: decisionWidth }}
            onClick={e => e.stopPropagation()}
          >
            {showDecisionCell && (
              <input
                type="checkbox"
                aria-label="Apply this change"
                title={decision === 'accept' ? 'Will be applied — uncheck to revert' : 'Will be reverted — check to keep this change'}
                checked={decision === 'accept'}
                onChange={onToggleDecision}
                className="w-4 h-4 cursor-pointer accent-slate-700"
              />
            )}
          </div>
        )}
        {columns.map(c => {
          const v = c.get(row);
          return (
            <div
              key={c.key}
              className="px-2 truncate text-sm text-slate-800"
              style={{ width: c.width, textAlign: c.align ?? 'left' }}
              title={v == null ? '' : String(v)}
            >
              {v == null ? <span className="text-slate-400">—</span> : String(v)}
            </div>
          );
        })}
      </div>
      {expanded && row.fields.length > 0 && (
        <div className="mr-3 mb-2 mt-1 border border-slate-200 rounded bg-white" style={{ marginLeft: 28 + decisionWidth }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 bg-slate-50">
                <th className="text-left px-3 py-1.5 w-1/4">Field</th>
                <th className="text-left px-3 py-1.5 w-3/8 text-removed-700">Baseline</th>
                <th className="text-left px-3 py-1.5 w-3/8 text-added-700">Revised</th>
              </tr>
            </thead>
            <tbody>
              {row.fields.map(f => (
                <tr key={f.field} className="border-t border-slate-100">
                  <td className="px-3 py-1 text-slate-600">{f.label}</td>
                  <td className="px-3 py-1 font-mono text-slate-800 line-through opacity-70">{formatValue(f.oldValue)}</td>
                  <td className="px-3 py-1 font-mono text-slate-900 font-semibold">{formatValue(f.newValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function statusSymbol(s: ChangeStatus): string {
  switch (s) {
    case 'added': return '+';
    case 'removed': return '−';
    case 'unchanged': return '';
    default: return '';
  }
}

function formatValue(v: unknown): string {
  if (v == null || v === '') return '—';
  return String(v);
}
