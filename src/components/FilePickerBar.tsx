import { useState } from 'react';
import { pickAndLoadXER, type LoadedXer } from '../lib/xer';

interface Props {
  baseline: LoadedXer | null;
  revised: LoadedXer | null;
  onBaselineChange: (v: LoadedXer | null) => void;
  onRevisedChange: (v: LoadedXer | null) => void;
  onSwap: () => void;
}

export function FilePickerBar({ baseline, revised, onBaselineChange, onRevisedChange, onSwap }: Props) {
  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-slate-900 mr-4">P6 Diff Tool</h1>
        <FileSlot
          label="Baseline (File A)"
          value={baseline}
          onChange={onBaselineChange}
          accent="text-slate-700"
        />
        <button
          onClick={onSwap}
          disabled={!baseline && !revised}
          className="px-2 py-1.5 text-sm rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700"
          title="Swap baseline and revised"
        >
          ⇄ Swap
        </button>
        <FileSlot
          label="Revised (File B)"
          value={revised}
          onChange={onRevisedChange}
          accent="text-slate-700"
        />
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-added-100 border border-added-500"></span>Added</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-removed-100 border border-removed-500"></span>Removed</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-modified-100 border border-modified-500"></span>Modified</span>
        </div>
      </div>
    </div>
  );
}

function FileSlot({
  label, value, onChange, accent
}: {
  label: string; value: LoadedXer | null; onChange: (v: LoadedXer | null) => void; accent: string;
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

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        onClick={pick}
        disabled={busy}
        className="px-3 py-1.5 text-sm font-medium rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? 'Loading…' : value ? 'Change…' : `Choose ${label}`}
      </button>
      <div className={`text-xs ${accent} truncate max-w-[16rem]`} title={value?.path ?? ''}>
        {err ? <span className="text-removed-700">Error: {err}</span> : (value ? value.fileName : <span className="text-slate-400">— no {label.toLowerCase()} —</span>)}
      </div>
      {value && (
        <button
          onClick={() => onChange(null)}
          className="text-slate-400 hover:text-slate-700 text-xs px-1"
          title="Clear"
        >
          ✕
        </button>
      )}
    </div>
  );
}
