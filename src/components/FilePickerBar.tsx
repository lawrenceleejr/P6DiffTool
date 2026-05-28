import { useState } from 'react';
import { pickAndLoadXER, type LoadedXer } from '../lib/xer';

export type DropTargetSlot = 'trunk' | 'branch' | 'branchBase';

export interface ExportSummary {
  /** 2-way mode (trunk + branch): apply/skip counts driven by per-row defaults. */
  twoWay?: { apply: number; skip: number };
  /** 3-way mode (trunk + branch + branchBase): clean / no-op / conflict counts. */
  threeWay?: { clean: number; noOp: number; conflicts: number; unresolved: number };
}

interface Props {
  trunk: LoadedXer | null;
  branch: LoadedXer | null;
  branchBase: LoadedXer | null;
  onTrunkChange: (v: LoadedXer | null) => void;
  onBranchChange: (v: LoadedXer | null) => void;
  onBranchBaseChange: (v: LoadedXer | null) => void;
  onSwap: () => void;
  canExport: boolean;
  onExport: () => void;
  isExporting: boolean;
  exportStatus: string | null;
  exportSummary: ExportSummary;
  activeDropTarget: DropTargetSlot | null;
}

export function FilePickerBar({
  trunk, branch, branchBase,
  onTrunkChange, onBranchChange, onBranchBaseChange, onSwap,
  canExport, onExport, isExporting, exportStatus, exportSummary, activeDropTarget
}: Props) {
  const tw = exportSummary.threeWay;
  const exportDisabled = isExporting || !!(tw && tw.unresolved > 0);
  return (
    <div className="border-b border-line bg-bg-surface px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-base font-semibold text-ink-50 mr-3 tracking-tight">
          <span className="text-accent">P6</span> Diff Tool
        </h1>

        <FileSlot
          slot="trunk"
          label="Trunk"
          tooltip="The file you trust as the current source of truth. The merged output starts from this and becomes the new trunk."
          value={trunk}
          onChange={onTrunkChange}
          highlighted={activeDropTarget === 'trunk'}
        />

        <button
          onClick={onSwap}
          disabled={!trunk && !branch}
          className="px-2 py-1.5 text-sm rounded-md border border-line bg-bg-raised hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed text-ink-200 transition-colors"
          title="Swap trunk and branch"
        >
          ⇄
        </button>

        <FileSlot
          slot="branch"
          label="Branch"
          tooltip="The file with proposed changes that should land on the trunk."
          value={branch}
          onChange={onBranchChange}
          highlighted={activeDropTarget === 'branch'}
        />

        <FileSlot
          slot="branchBase"
          label="Branch base"
          tooltip="Optional. The trunk version the branch was cut from. Supplying this enables high-fidelity 3-way merging with conflict detection."
          optional
          value={branchBase}
          onChange={onBranchBaseChange}
          highlighted={activeDropTarget === 'branchBase'}
        />

        <div className="ml-auto flex items-center gap-3 text-xs text-ink-300">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#10b981' }}></span>Added</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#ef4444' }}></span>Removed</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#f59e0b' }}></span>Modified</span>
          {canExport && (
            <>
              <span className="mx-1 h-4 w-px bg-line-strong" />
              {tw ? (
                <span className="text-ink-300">
                  3-way · <b className="text-emerald-300">{tw.clean}</b> clean ·{' '}
                  <b className="text-ink-300">{tw.noOp}</b> no-op ·{' '}
                  <b className={tw.unresolved > 0 ? 'text-amber-300' : 'text-ink-300'}>
                    {tw.unresolved}/{tw.conflicts}
                  </b> unresolved
                </span>
              ) : exportSummary.twoWay && (
                <span className="text-ink-300" title="In 2-way mode, branch-removed rows default to skip to protect trunk data — load a Branch base for unambiguous 3-way merging.">
                  2-way · <b className="text-ink-50">{exportSummary.twoWay.apply}</b> apply ·{' '}
                  <b className="text-ink-50">{exportSummary.twoWay.skip}</b> skip
                </span>
              )}
              <button
                onClick={onExport}
                disabled={exportDisabled}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-accent-ink hover:bg-accent-hover transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                title={tw && tw.unresolved > 0
                  ? `Resolve ${tw.unresolved} conflict${tw.unresolved === 1 ? '' : 's'} in the Conflicts tab first`
                  : 'Save an updated trunk with the chosen branch changes applied'}
              >
                {isExporting && <Spinner />}
                {isExporting ? 'Exporting…' : 'Export updated trunk…'}
              </button>
            </>
          )}
        </div>
      </div>
      {(exportStatus || isExporting) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-ink-300 truncate" title={exportStatus ?? ''}>
          {isExporting && <span className="inline-block w-32 h-1 rounded-full bg-bg-raised overflow-hidden">
            <span className="block h-full bg-accent animate-progress-stripe" />
          </span>}
          <span className="truncate">{exportStatus}</span>
        </div>
      )}
    </div>
  );
}

function FileSlot({
  slot, label, tooltip, value, onChange, highlighted, optional
}: {
  slot: DropTargetSlot;
  label: string;
  tooltip: string;
  value: LoadedXer | null;
  onChange: (v: LoadedXer | null) => void;
  highlighted: boolean;
  optional?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick() {
    setBusy(true);
    setErr(null);
    try {
      const result = await pickAndLoadXER();
      if (result) onChange(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const btnLabel = busy ? 'Loading…' : value ? 'Change…' : optional ? `+ ${label}` : `Choose ${label}`;

  return (
    <div
      data-drop-slot={slot}
      className={`flex items-center gap-2 min-w-0 rounded-md px-1 py-0.5 transition-all ${highlighted ? 'drop-target' : ''}`}
    >
      <button
        onClick={pick}
        disabled={busy}
        className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${optional && !value ? 'border-line/60 bg-bg-base hover:bg-bg-hover text-ink-300 border-dashed' : 'border-line bg-bg-raised hover:bg-bg-hover text-ink-100'} disabled:opacity-50`}
        title={tooltip}
      >
        {value || !optional ? <><span className="text-ink-300 mr-1.5">{label}:</span>{btnLabel}</> : btnLabel}
      </button>
      <div className="text-xs truncate max-w-[14rem]" title={value?.path ?? ''}>
        {err ? (
          <span className="text-red-400">Error: {err}</span>
        ) : value ? (
          <span className="text-ink-100">{value.fileName}</span>
        ) : optional ? null : (
          <span className="text-ink-400">— drop or pick —</span>
        )}
      </div>
      {value && (
        <button
          onClick={() => onChange(null)}
          className="text-ink-400 hover:text-ink-100 text-xs px-1 transition-colors"
          title="Clear"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
