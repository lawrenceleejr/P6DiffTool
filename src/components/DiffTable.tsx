import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { CategoryDiff, ChangeStatus, DiffRow } from '../lib/diff';
import type { Decision } from '../lib/merge';

export interface DiffColumn<T> {
  key: string;
  header: string;
  /** Default width in pixels. The user can resize via the drag handle. */
  width: number;
  get: (row: DiffRow<T>) => unknown;
  align?: 'left' | 'right';
  format?: (value: unknown) => string;
  /** Set false to disable sorting on this column (default: enabled). */
  sortable?: boolean;
}

/** Extra rows appended to the expanded panel as informational context
 * (e.g. an activity's update_date / update_user). Not part of the diff. */
export interface InfoRow {
  label: string;
  oldValue: unknown;
  newValue: unknown;
}

interface Props<T> {
  diff: CategoryDiff<T>;
  columns: DiffColumn<T>[];
  emptyMessage?: string;
  decisions?: Map<string, Decision>;
  onToggleDecision?: (key: string) => void;
  onBulkSetDecisions?: (keys: string[], decision: Decision) => void;
  /** Optional callback returning extra context rows to show under the
   * field-diff table when a modified row is expanded. */
  infoRowsFor?: (row: DiffRow<T>) => InfoRow[];
}

type FilterMode = 'all' | 'changes-only' | ChangeStatus;
type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const ROW_HEIGHT = 38;
const EXPANDED_EXTRA = 30;
const MIN_COL_WIDTH = 60;

export function DiffTable<T>({
  diff, columns, emptyMessage = 'No rows.', decisions, onToggleDecision, onBulkSetDecisions, infoRowsFor
}: Props<T>) {
  const [filter, setFilter] = useState<FilterMode>('changes-only');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>(null);
  const [widthOverrides, setWidthOverrides] = useState<Map<string, number>>(new Map());
  const showDecision = decisions !== undefined && onToggleDecision !== undefined;

  // Reset overrides when the column set changes (e.g. switching tabs).
  useEffect(() => { setWidthOverrides(new Map()); setSort(null); }, [columns]);

  const colWidth = useCallback(
    (c: DiffColumn<T>) => widthOverrides.get(c.key) ?? c.width,
    [widthOverrides]
  );

  const filteredRows = useMemo(() => {
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

  const visibleRows = useMemo(() => {
    if (!sort) return filteredRows;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return filteredRows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => compareValues(col.get(a), col.get(b)) * dir);
  }, [filteredRows, sort, columns]);

  const visibleChangeKeys = useMemo(
    () => visibleRows.filter(r => r.status !== 'unchanged').map(r => r.key),
    [visibleRows]
  );

  const DECISION_WIDTH = 56;
  const totalWidth =
    columns.reduce((sum, c) => sum + colWidth(c), 0) + 28 + (showDecision ? DECISION_WIDTH : 0);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: i => {
      const row = visibleRows[i];
      const isExpanded = expanded.has(row.key);
      const extra = isExpanded ? Math.max(row.fields.length, 1) * EXPANDED_EXTRA + 16 : 0;
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

  function onHeaderClick(col: DiffColumn<T>) {
    if (col.sortable === false) return;
    setSort(prev => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc')  return { key: col.key, dir: 'desc' };
      return null;            // cycle off
    });
  }

  function startResize(colKey: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const col = columns.find(c => c.key === colKey);
    if (!col) return;
    const startX = e.clientX;
    const startWidth = colWidth(col);

    function onMove(ev: MouseEvent) {
      const w = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
      setWidthOverrides(prev => {
        const next = new Map(prev);
        next.set(colKey, w);
        return next;
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
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
        showDecision={showDecision}
        onApplyAllVisible={
          onBulkSetDecisions ? () => onBulkSetDecisions(visibleChangeKeys, 'apply') : undefined
        }
        onApplyNoneVisible={
          onBulkSetDecisions ? () => onBulkSetDecisions(visibleChangeKeys, 'skip') : undefined
        }
        visibleChangeCount={visibleChangeKeys.length}
      />
      <div ref={parentRef} className="flex-1 overflow-auto bg-bg-base">
        <div style={{ width: totalWidth, position: 'relative' }}>
          <Header
            columns={columns}
            showDecision={showDecision}
            decisionWidth={DECISION_WIDTH}
            colWidth={colWidth}
            sort={sort}
            onHeaderClick={onHeaderClick}
            onStartResize={startResize}
          />
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
                    colWidth={colWidth}
                    expanded={isExpanded}
                    onToggle={() => toggleExpanded(row.key)}
                    decision={showDecision ? (decisions!.get(row.key) ?? 'apply') : undefined}
                    onToggleDecision={showDecision ? () => onToggleDecision!(row.key) : undefined}
                    decisionWidth={showDecision ? DECISION_WIDTH : 0}
                    infoRows={infoRowsFor ? infoRowsFor(row) : []}
                  />
                </div>
              );
            })}
            {visibleRows.length === 0 && (
              <div className="p-8 text-center text-ink-400">{emptyMessage}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toolbar<T>({
  diff, filter, onFilter, query, onQuery, visibleCount,
  showDecision, onApplyAllVisible, onApplyNoneVisible, visibleChangeCount
}: {
  diff: CategoryDiff<T>;
  filter: FilterMode;
  onFilter: (m: FilterMode) => void;
  query: string;
  onQuery: (q: string) => void;
  visibleCount: number;
  showDecision: boolean;
  onApplyAllVisible?: () => void;
  onApplyNoneVisible?: () => void;
  visibleChangeCount: number;
}) {
  const total = diff.rows.length;
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-line bg-bg-surface text-sm flex-wrap">
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
        className="ml-2 px-2.5 py-1 text-sm rounded-md border border-line bg-bg-base text-ink-100 placeholder:text-ink-400 w-48 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
      />
      {showDecision && onApplyAllVisible && onApplyNoneVisible && (
        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-xs text-ink-400 mr-1">Bulk:</span>
          <button
            onClick={onApplyAllVisible}
            disabled={visibleChangeCount === 0}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={`Apply all ${visibleChangeCount} currently-shown branch changes to the trunk`}
          >
            Apply all
          </button>
          <button
            onClick={onApplyNoneVisible}
            disabled={visibleChangeCount === 0}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={`Skip all ${visibleChangeCount} currently-shown branch changes (trunk keeps its state)`}
          >
            Apply none
          </button>
        </div>
      )}
      <div className="ml-auto text-xs text-ink-400">{visibleCount} shown</div>
    </div>
  );
}

function FilterChip({
  label, active, onClick, accent
}: { label: string; active: boolean; onClick: () => void; accent?: 'added' | 'removed' | 'modified' }) {
  const tone =
    accent === 'added' ? 'border-emerald-500/40 text-emerald-300' :
    accent === 'removed' ? 'border-red-500/40 text-red-300' :
    accent === 'modified' ? 'border-amber-500/40 text-amber-300' :
    'border-line text-ink-200';
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-md border ${tone} ${active ? 'bg-bg-raised font-semibold' : 'bg-bg-base hover:bg-bg-hover'} transition-colors`}
    >
      {label}
    </button>
  );
}

function Header<T>({
  columns, showDecision, decisionWidth, colWidth, sort, onHeaderClick, onStartResize
}: {
  columns: DiffColumn<T>[];
  showDecision: boolean;
  decisionWidth: number;
  colWidth: (c: DiffColumn<T>) => number;
  sort: SortState;
  onHeaderClick: (c: DiffColumn<T>) => void;
  onStartResize: (key: string, e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex bg-bg-surface border-b border-line text-xs uppercase tracking-wide text-ink-300 font-semibold"
      style={{ position: 'sticky', top: 0, zIndex: 1, height: ROW_HEIGHT }}
    >
      <div style={{ width: 28 }} />
      {showDecision && (
        <div className="px-2 py-2 text-center" style={{ width: decisionWidth }} title="Apply this change to the merged output?">
          Apply
        </div>
      )}
      {columns.map(c => {
        const sortable = c.sortable !== false;
        const isSorted = sort?.key === c.key;
        const arrow = !isSorted ? '' : sort!.dir === 'asc' ? ' ▲' : ' ▼';
        return (
          <div
            key={c.key}
            className="relative flex items-center select-none"
            style={{ width: colWidth(c), height: ROW_HEIGHT, textAlign: c.align ?? 'left' }}
            title={c.header}
          >
            <button
              type="button"
              onClick={() => onHeaderClick(c)}
              disabled={!sortable}
              className={`flex-1 h-full px-2 truncate text-left ${c.align === 'right' ? 'text-right' : ''} ${sortable ? 'hover:text-ink-100 cursor-pointer' : 'cursor-default'} ${isSorted ? 'text-accent' : ''}`}
              style={{ textAlign: c.align ?? 'left' }}
            >
              {c.header}{arrow}
            </button>
            <div
              onMouseDown={e => onStartResize(c.key, e)}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/60"
              title="Drag to resize"
            />
          </div>
        );
      })}
    </div>
  );
}

function Row<T>({
  row, columns, colWidth, expanded, onToggle, decision, onToggleDecision, decisionWidth, infoRows
}: {
  row: DiffRow<T>;
  columns: DiffColumn<T>[];
  colWidth: (c: DiffColumn<T>) => number;
  expanded: boolean;
  onToggle: () => void;
  decision?: Decision;
  onToggleDecision?: () => void;
  decisionWidth: number;
  infoRows: InfoRow[];
}) {
  const cls = `row-${row.status}`;
  const showDecisionCell = decision !== undefined && row.status !== 'unchanged';
  return (
    <div className={cls}>
      <div
        className="flex items-center cursor-pointer"
        style={{ height: ROW_HEIGHT }}
        onClick={row.status === 'modified' ? onToggle : undefined}
      >
        <div className="flex items-center justify-center text-ink-400 text-xs" style={{ width: 28 }}>
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
                title={decision === 'apply' ? 'Will be applied to the merged trunk — uncheck to skip' : 'Will be skipped (trunk keeps its current state) — check to apply this change'}
                checked={decision === 'apply'}
                onChange={onToggleDecision}
                className="w-4 h-4 cursor-pointer accent-accent"
              />
            )}
          </div>
        )}
        {columns.map(c => {
          const v = c.get(row);
          return (
            <div
              key={c.key}
              className="px-2 truncate text-sm text-ink-100"
              style={{ width: colWidth(c), textAlign: c.align ?? 'left' }}
              title={v == null ? '' : String(v)}
            >
              {v == null ? <span className="text-ink-500">—</span> : String(v)}
            </div>
          );
        })}
      </div>
      {expanded && (row.fields.length > 0 || infoRows.length > 0) && (
        <div className="mr-3 mb-2 mt-1 border border-line rounded-md bg-bg-raised" style={{ marginLeft: 28 + decisionWidth }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink-400 bg-bg-surface">
                <th className="text-left px-3 py-1.5 w-1/4">Field</th>
                <th className="text-left px-3 py-1.5 w-3/8 text-red-300">Trunk</th>
                <th className="text-left px-3 py-1.5 w-3/8 text-emerald-300">Branch</th>
              </tr>
            </thead>
            <tbody>
              {row.fields.map(f => (
                <tr key={`f-${f.field}`} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-300">{f.label}</td>
                  <td className="px-3 py-1.5 font-mono text-ink-200 line-through opacity-70">{formatValue(f.oldValue)}</td>
                  <td className="px-3 py-1.5 font-mono text-ink-50 font-semibold">{formatValue(f.newValue)}</td>
                </tr>
              ))}
              {infoRows.length > 0 && (
                <tr className="border-t border-line">
                  <td colSpan={3} className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                    Metadata
                  </td>
                </tr>
              )}
              {infoRows.map((r, i) => (
                <tr key={`i-${i}-${r.label}`} className="border-t border-line/50">
                  <td className="px-3 py-1.5 text-ink-400 italic">{r.label}</td>
                  <td className="px-3 py-1.5 font-mono text-ink-300">{formatValue(r.oldValue)}</td>
                  <td className="px-3 py-1.5 font-mono text-ink-300">{formatValue(r.newValue)}</td>
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

/** Sort comparator: undefined sorts last; numbers numerically; otherwise
 * locale-aware string compare. */
function compareValues(a: unknown, b: unknown): number {
  const aMissing = a == null || a === '';
  const bMissing = b == null || b === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
    return na - nb;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
