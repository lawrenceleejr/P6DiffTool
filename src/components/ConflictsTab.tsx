// Dedicated conflict-resolution surface for 3-way merge. Lists every
// conflict row (across Activities + Logic) with per-row "Take branch" /
// "Keep trunk" shortcuts plus per-field [Branch] [Trunk] [Base] buttons
// for modify-modify cases.

import type {
  ThreeWayResult, ThreeWayRow, ThreeWayField,
  ResolutionState, RowResolution, FieldResolution, ConflictKind
} from '../lib/threeway';
import type { ActivityRecord, RelationshipRecord } from '../lib/diff';

type Category = 'activities' | 'relationships';

interface Props {
  threeWay: ThreeWayResult;
  resolutions: ResolutionState;
  onSetRowResolution: (category: Category, key: string, resolution: RowResolution | undefined) => void;
  onSetFieldResolution: (category: Category, key: string, field: string, resolution: FieldResolution | undefined) => void;
  onBulkResolve: (category: Category, keys: string[], resolution: RowResolution) => void;
}

export function ConflictsTab({
  threeWay, resolutions, onSetRowResolution, onSetFieldResolution, onBulkResolve
}: Props) {
  const activityConflicts = threeWay.activities.rows.filter(r => r.status === 'conflict');
  const relationshipConflicts = threeWay.relationships.rows.filter(r => r.status === 'conflict');
  const totalConflicts = activityConflicts.length + relationshipConflicts.length;

  const resolvedCount =
    countResolved(activityConflicts, resolutions.activityRows, resolutions.activityFields) +
    countResolved(relationshipConflicts, resolutions.relationshipRows, resolutions.relationshipFields);
  const unresolved = totalConflicts - resolvedCount;

  if (totalConflicts === 0) {
    return (
      <div className="h-full overflow-auto p-12 text-center">
        <div className="text-2xl font-semibold text-emerald-300 mb-2">No conflicts</div>
        <p className="text-sm text-ink-400 max-w-md mx-auto">
          The branch changes apply cleanly onto the trunk. You can export
          the updated trunk directly from the top bar.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 sticky top-0 bg-bg-base py-2 -mt-2 -mx-2 px-2 z-10">
          <div className="text-sm text-ink-300">
            <b className={unresolved > 0 ? 'text-amber-300' : 'text-emerald-300'}>{unresolved}</b> unresolved ·{' '}
            <b className="text-ink-50">{resolvedCount}</b> resolved · {totalConflicts} total
          </div>
        </div>

        <ConflictSection<ActivityRecord>
          title="Activities"
          rows={activityConflicts}
          rowRes={resolutions.activityRows}
          fieldRes={resolutions.activityFields}
          renderKey={r => activityLabel(r)}
          onRow={(key, res) => onSetRowResolution('activities', key, res)}
          onField={(key, f, res) => onSetFieldResolution('activities', key, f, res)}
          onBulk={(keys, res) => onBulkResolve('activities', keys, res)}
        />

        <ConflictSection<RelationshipRecord>
          title="Logic (relationships)"
          rows={relationshipConflicts}
          rowRes={resolutions.relationshipRows}
          fieldRes={resolutions.relationshipFields}
          renderKey={r => relationshipLabel(r)}
          onRow={(key, res) => onSetRowResolution('relationships', key, res)}
          onField={(key, f, res) => onSetFieldResolution('relationships', key, f, res)}
          onBulk={(keys, res) => onBulkResolve('relationships', keys, res)}
        />
      </div>
    </div>
  );
}

function ConflictSection<T>({
  title, rows, rowRes, fieldRes, renderKey, onRow, onField, onBulk
}: {
  title: string;
  rows: ThreeWayRow<T>[];
  rowRes: Map<string, RowResolution>;
  fieldRes: Map<string, Map<string, FieldResolution>>;
  renderKey: (r: ThreeWayRow<T>) => string;
  onRow: (key: string, res: RowResolution | undefined) => void;
  onField: (key: string, field: string, res: FieldResolution | undefined) => void;
  onBulk: (keys: string[], res: RowResolution) => void;
}) {
  if (rows.length === 0) return null;
  const keys = rows.map(r => r.key);
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
          {title} <span className="text-ink-500">({rows.length})</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-ink-400 mr-1">Bulk:</span>
          <button
            onClick={() => onBulk(keys, 'take-source')}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            title="Resolve every conflict in this section by taking the branch's value"
          >
            Take branch
          </button>
          <button
            onClick={() => onBulk(keys, 'keep-target')}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-line bg-bg-raised text-ink-200 hover:bg-bg-hover transition-colors"
            title="Resolve every conflict in this section by keeping the trunk's value"
          >
            Keep trunk
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {rows.map(row => (
          <ConflictRow
            key={row.key}
            row={row}
            label={renderKey(row)}
            rowRes={rowRes.get(row.key)}
            fieldRes={fieldRes.get(row.key)}
            onRow={res => onRow(row.key, res)}
            onField={(f, res) => onField(row.key, f, res)}
          />
        ))}
      </div>
    </section>
  );
}

function ConflictRow<T>({
  row, label, rowRes, fieldRes, onRow, onField
}: {
  row: ThreeWayRow<T>;
  label: string;
  rowRes: RowResolution | undefined;
  fieldRes: Map<string, FieldResolution> | undefined;
  onRow: (res: RowResolution | undefined) => void;
  onField: (field: string, res: FieldResolution | undefined) => void;
}) {
  const kind = row.conflictKind!;
  const resolved = isResolved(row, rowRes, fieldRes);
  const conflictingFields = row.fields.filter(f => f.status === 'conflict');

  return (
    <div className={`rounded-xl border ${resolved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line/50">
        <KindBadge kind={kind} />
        <code className="text-sm text-ink-100 font-mono truncate flex-1" title={row.key}>{label}</code>
        {resolved
          ? <span className="text-xs text-emerald-300 font-medium">✓ resolved</span>
          : <span className="text-xs text-amber-300 font-medium">⚠ needs decision</span>}
      </div>

      {kind !== 'modify-modify' && (
        <RowLevelChoice
          kind={kind}
          row={row}
          chosen={rowRes}
          onChoose={onRow}
        />
      )}

      {kind === 'modify-modify' && conflictingFields.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-400 bg-bg-surface">
              <th className="text-left px-4 py-1.5 w-1/4">Field</th>
              <th className="text-left px-3 py-1.5">Branch base</th>
              <th className="text-left px-3 py-1.5 text-emerald-300">Branch</th>
              <th className="text-left px-3 py-1.5 text-amber-300">Trunk</th>
              <th className="text-right px-4 py-1.5 w-72">Resolve</th>
            </tr>
          </thead>
          <tbody>
            {conflictingFields.map(f => (
              <FieldRowView
                key={f.field}
                f={f}
                chosen={fieldRes?.get(f.field) ?? (rowRes === 'take-source' ? 'take-source' : rowRes === 'keep-target' ? 'keep-target' : undefined)}
                onChoose={res => onField(f.field, res)}
              />
            ))}
          </tbody>
        </table>
      )}

      {kind === 'modify-modify' && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-line/50 text-xs text-ink-400">
          <span className="mr-1">Row shortcut:</span>
          <ShortcutBtn label="Take all branch" active={rowRes === 'take-source'} onClick={() => onRow(rowRes === 'take-source' ? undefined : 'take-source')} tone="source" />
          <ShortcutBtn label="Keep all trunk" active={rowRes === 'keep-target'} onClick={() => onRow(rowRes === 'keep-target' ? undefined : 'keep-target')} tone="target" />
        </div>
      )}
    </div>
  );
}

function RowLevelChoice<T>({
  kind, row, chosen, onChoose
}: {
  kind: ConflictKind;
  row: ThreeWayRow<T>;
  chosen: RowResolution | undefined;
  onChoose: (res: RowResolution | undefined) => void;
}) {
  const desc = describeConflict(kind);
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-ink-300 mb-2">{desc.text}</p>
      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2.5">
          <div className="text-emerald-300 font-semibold mb-1">{desc.bLabel}</div>
          <RecordPreview value={row.source ?? row.target} kind={kind} side="B" />
        </div>
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5">
          <div className="text-amber-300 font-semibold mb-1">{desc.cLabel}</div>
          <RecordPreview value={row.target ?? row.source} kind={kind} side="C" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ShortcutBtn label={desc.bAction} active={chosen === 'take-source'} onClick={() => onChoose(chosen === 'take-source' ? undefined : 'take-source')} tone="source" />
        <ShortcutBtn label={desc.cAction} active={chosen === 'keep-target'} onClick={() => onChoose(chosen === 'keep-target' ? undefined : 'keep-target')} tone="target" />
      </div>
    </div>
  );
}

function FieldRowView({
  f, chosen, onChoose
}: { f: ThreeWayField; chosen: FieldResolution | undefined; onChoose: (res: FieldResolution | undefined) => void }) {
  return (
    <tr className="border-t border-line/50">
      <td className="px-4 py-1.5 text-ink-300">{f.label}</td>
      <td className="px-3 py-1.5 font-mono text-ink-300">{fmt(f.base)}</td>
      <td className="px-3 py-1.5 font-mono text-emerald-200">{fmt(f.source)}</td>
      <td className="px-3 py-1.5 font-mono text-amber-200">{fmt(f.target)}</td>
      <td className="px-4 py-1 text-right">
        <div className="inline-flex gap-1">
          <FieldBtn label="branch" tone="source" active={chosen === 'take-source'} onClick={() => onChoose(chosen === 'take-source' ? undefined : 'take-source')} title={`Use branch's value: ${fmt(f.source)}`} />
          <FieldBtn label="trunk"  tone="target" active={chosen === 'keep-target'} onClick={() => onChoose(chosen === 'keep-target' ? undefined : 'keep-target')} title={`Keep trunk's value: ${fmt(f.target)}`} />
          <FieldBtn label="base"   tone="base"   active={chosen === 'use-base'}     onClick={() => onChoose(chosen === 'use-base'     ? undefined : 'use-base')}     title={`Revert to branch base: ${fmt(f.base)}`} />
        </div>
      </td>
    </tr>
  );
}

function FieldBtn({
  label, tone, active, onClick, title
}: { label: string; tone: 'source' | 'target' | 'base'; active: boolean; onClick: () => void; title: string }) {
  const tones = {
    source: active ? 'bg-emerald-500/30 border-emerald-400 text-emerald-100' : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15',
    target: active ? 'bg-amber-500/30 border-amber-400 text-amber-100'       : 'border-amber-500/40 text-amber-300 hover:bg-amber-500/15',
    base:   active ? 'bg-ink-500/30 border-ink-300 text-ink-50'              : 'border-line text-ink-300 hover:bg-bg-hover'
  };
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 h-7 text-[11px] font-semibold rounded border transition-colors ${tones[tone]}`}
    >
      {label}
    </button>
  );
}

function ShortcutBtn({
  label, active, onClick, tone
}: { label: string; active: boolean; onClick: () => void; tone: 'source' | 'target' }) {
  const c = tone === 'source'
    ? (active ? 'bg-emerald-500/30 border-emerald-400 text-emerald-100' : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15')
    : (active ? 'bg-amber-500/30 border-amber-400 text-amber-100'       : 'border-amber-500/40 text-amber-300 hover:bg-amber-500/15');
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${c}`}
    >
      {label}
    </button>
  );
}

function KindBadge({ kind }: { kind: ConflictKind }) {
  const labels: Record<ConflictKind, string> = {
    'add-add':        'add / add',
    'modify-delete':  'modify / delete',
    'delete-modify':  'delete / modify',
    'modify-modify':  'modify / modify'
  };
  return (
    <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-md bg-bg-raised border border-line text-ink-300">
      {labels[kind]}
    </span>
  );
}

function describeConflict(kind: ConflictKind): { text: string; bLabel: string; cLabel: string; bAction: string; cAction: string } {
  switch (kind) {
    case 'add-add':
      return {
        text: 'Both files added a row with this key. Choose which version to keep in the merged output.',
        bLabel: 'Branch added', cLabel: 'Trunk has its own row',
        bAction: "Take branch's version", cAction: "Keep trunk's version"
      };
    case 'modify-delete':
      return {
        text: 'Branch modified this row, but trunk has deleted it.',
        bLabel: 'B modified — would re-insert', cLabel: 'C deleted',
        bAction: "Re-insert with branch's changes", cAction: "Keep trunk's deletion"
      };
    case 'delete-modify':
      return {
        text: 'Branch deleted this row, but trunk has its own modifications.',
        bLabel: 'B deleted', cLabel: "C's modified version",
        bAction: 'Delete from trunk', cAction: "Keep trunk's row"
      };
    case 'modify-modify':
      return {
        text: 'Both modified this row.',
        bLabel: '', cLabel: '',
        bAction: '', cAction: ''
      };
  }
}

function RecordPreview({ value, kind, side }: { value: unknown; kind: ConflictKind; side: 'B' | 'C' }) {
  if (!value) return <span className="text-ink-500">(absent)</span>;
  const v = value as any;
  // Common visible fields across activity / relationship records
  const lines: string[] = [];
  if (v.activityId) lines.push(`Activity ID: ${v.activityId}`);
  if (v.predecessorId && v.successorId) lines.push(`${v.predecessorId} → ${v.successorId} (${v.type})`);
  if (v.name) lines.push(`Name: ${v.name}`);
  if (v.status) lines.push(`Status: ${v.status}`);
  if (v.targetStart) lines.push(`Start: ${v.targetStart}`);
  if (v.targetFinish) lines.push(`Finish: ${v.targetFinish}`);
  if (v.originalDurationHrs != null) lines.push(`Duration: ${v.originalDurationHrs}h`);
  if (v.lagHrs != null) lines.push(`Lag: ${v.lagHrs}h`);
  if (lines.length === 0) lines.push(`${side} value`);
  return (
    <div className="font-mono text-ink-200 leading-relaxed">
      {lines.slice(0, 5).map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
  void kind;
}

function activityLabel(r: ThreeWayRow<ActivityRecord>): string {
  const v = (r.source ?? r.target ?? r.base) as ActivityRecord | undefined;
  if (!v) return r.key;
  return `${v.activityId}  ${v.name ?? ''}`;
}

function relationshipLabel(r: ThreeWayRow<RelationshipRecord>): string {
  const v = (r.source ?? r.target ?? r.base) as RelationshipRecord | undefined;
  if (!v) return r.key;
  return `${v.predecessorId} → ${v.successorId}  (${v.type})`;
}

function fmt(v: unknown): string {
  if (v == null || v === '') return '—';
  return String(v);
}

function isResolved<T>(
  row: ThreeWayRow<T>,
  rowRes: RowResolution | undefined,
  fieldRes: Map<string, FieldResolution> | undefined
): boolean {
  if (row.conflictKind !== 'modify-modify') return rowRes !== undefined;
  if (rowRes !== undefined) return true;
  if (!fieldRes) return false;
  return row.fields.every(f => f.status !== 'conflict' || fieldRes.has(f.field));
}

function countResolved<T>(
  rows: ThreeWayRow<T>[],
  rowResMap: Map<string, RowResolution>,
  fieldResMap: Map<string, Map<string, FieldResolution>>
): number {
  let n = 0;
  for (const r of rows) {
    if (isResolved(r, rowResMap.get(r.key), fieldResMap.get(r.key))) n++;
  }
  return n;
}
