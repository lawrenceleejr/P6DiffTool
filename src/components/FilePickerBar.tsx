import { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { pickAndLoadXER, type LoadedXer } from '../lib/xer';

export type DropTargetSlot = 'baseline' | 'revised';

interface Props {
  baseline: LoadedXer | null;
  revised: LoadedXer | null;
  onBaselineChange: (v: LoadedXer | null) => void;
  onRevisedChange: (v: LoadedXer | null) => void;
  onSwap: () => void;
  canExport: boolean;
  onExport: () => void;
  exportStatus: string | null;
  acceptedCount: number;
  rejectedCount: number;
  /** Which slot the user is currently hovering with a dragged file, if any.
   * Used to highlight the drop target. */
  activeDropTarget: DropTargetSlot | null;
}

export function FilePickerBar({
  baseline, revised, onBaselineChange, onRevisedChange, onSwap,
  canExport, onExport, exportStatus, acceptedCount, rejectedCount, activeDropTarget
}: Props) {
  return (
    <div
      data-tauri-drag-region
      className="border-b border-line bg-bg-surface px-4 py-3 select-none"
    >
      <div data-tauri-drag-region className="flex items-center gap-3 flex-wrap">
        <h1 data-tauri-drag-region className="text-base font-semibold text-ink-50 mr-3 tracking-tight">
          <span className="text-accent">P6</span> Diff Tool
        </h1>

        <FileSlot
          slot="baseline"
          label="Baseline (File A)"
          value={baseline}
          onChange={onBaselineChange}
          highlighted={activeDropTarget === 'baseline'}
        />

        <button
          onClick={onSwap}
          disabled={!baseline && !revised}
          className="px-2 py-1.5 text-sm rounded-md border border-line bg-bg-raised hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed text-ink-200 transition-colors"
          title="Swap baseline and revised"
        >
          ⇄
        </button>

        <FileSlot
          slot="revised"
          label="Revised (File B)"
          value={revised}
          onChange={onRevisedChange}
          highlighted={activeDropTarget === 'revised'}
        />

        <div data-tauri-drag-region className="ml-auto flex items-center gap-3 text-xs text-ink-300">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#10b981' }}></span>Added</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#ef4444' }}></span>Removed</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#f59e0b' }}></span>Modified</span>
          {canExport && (
            <>
              <span className="mx-1 h-4 w-px bg-line-strong" />
              <span className="text-ink-300">
                <b className="text-ink-50">{acceptedCount}</b> apply ·{' '}
                <b className="text-ink-50">{rejectedCount}</b> revert
              </span>
              <button
                onClick={onExport}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-accent-ink hover:bg-accent-hover transition-colors shadow-sm"
                title="Save a merged XER reflecting your accept/reject decisions"
              >
                Export merged XER…
              </button>
            </>
          )}
          <WindowControls />
        </div>
      </div>
      {exportStatus && (
        <div className="mt-2 text-xs text-ink-300 truncate" title={exportStatus}>{exportStatus}</div>
      )}
    </div>
  );
}

function FileSlot({
  slot, label, value, onChange, highlighted
}: {
  slot: DropTargetSlot;
  label: string;
  value: LoadedXer | null;
  onChange: (v: LoadedXer | null) => void;
  highlighted: boolean;
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

  const btnLabel = busy ? 'Loading…' : value ? 'Change…' : `Choose ${label.split(' ')[0]}`;

  return (
    <div
      data-drop-slot={slot}
      className={`flex items-center gap-2 min-w-0 rounded-md px-1 py-0.5 ${highlighted ? 'drop-target' : ''}`}
    >
      <button
        onClick={pick}
        disabled={busy}
        className="px-3 py-1.5 text-sm font-medium rounded-md border border-line bg-bg-raised hover:bg-bg-hover disabled:opacity-50 text-ink-100 transition-colors"
        title={`Click to choose, or drag an .xer file here`}
      >
        <span className="text-ink-300 mr-1.5">{label}:</span>
        {btnLabel}
      </button>
      <div className="text-xs truncate max-w-[14rem]" title={value?.path ?? ''}>
        {err ? (
          <span className="text-red-400">Error: {err}</span>
        ) : value ? (
          <span className="text-ink-100">{value.fileName}</span>
        ) : (
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

function WindowControls() {
  async function call(action: 'minimize' | 'toggleMaximize' | 'close') {
    try {
      const win = getCurrentWindow();
      if (action === 'minimize') await win.minimize();
      else if (action === 'toggleMaximize') await win.toggleMaximize();
      else await win.close();
    } catch {
      // running outside Tauri (e.g., vite dev) — silently no-op
    }
  }
  return (
    <div className="flex items-center gap-1 ml-2">
      <WinBtn label="Minimize" onClick={() => call('minimize')}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M1.5 5h7" /></svg>
      </WinBtn>
      <WinBtn label="Maximize" onClick={() => call('toggleMaximize')}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1.5" y="1.5" width="7" height="7" /></svg>
      </WinBtn>
      <WinBtn label="Close" onClick={() => call('close')} danger>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 2l6 6M8 2l-6 6" /></svg>
      </WinBtn>
    </div>
  );
}

function WinBtn({
  children, label, onClick, danger
}: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-7 h-7 flex items-center justify-center rounded text-ink-300 hover:text-ink-50 transition-colors ${danger ? 'hover:bg-red-500/80 hover:text-white' : 'hover:bg-bg-hover'}`}
    >
      {children}
    </button>
  );
}
