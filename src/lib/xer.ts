// File I/O and parse glue. The Tauri dialog returns an absolute path string
// (string | null); the fs plugin reads it with no baseDir. The "fs:scope":
// "**" capability in src-tauri/capabilities/default.json is what lets fs
// touch arbitrary user-selected paths.

import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { XER } from 'xer-parser';

const XER_FILTER = [{ name: 'Primavera P6 XER', extensions: ['xer'] }];

export interface LoadedXer {
  path: string;
  fileName: string;
  text: string;     // original file text, kept so the merge engine can re-parse as a "clone"
  xer: XER;
}

/** Show open dialog, read selected XER, return parsed instance. Returns null
 * if the user cancels. Throws on parse failure. */
export async function pickAndLoadXER(): Promise<LoadedXer | null> {
  const path = await open({ multiple: false, directory: false, filters: XER_FILTER });
  if (path === null || typeof path !== 'string') return null;
  return loadXerFromPath(path);
}

export async function loadXerFromPath(path: string): Promise<LoadedXer> {
  const text = await readTextFile(path);
  const xer = new XER(text);
  return { path, fileName: basename(path), text, xer };
}

/** V2: serialize an XER (after merge) and prompt the user for a save location. */
export async function saveXer(xer: XER, defaultName = 'merged.xer'): Promise<string | null> {
  const path = await save({ filters: XER_FILTER, defaultPath: defaultName });
  if (path === null) return null;
  // xer-parser's .d.ts mistypes lineEnding as escaped literals; the runtime
  // accepts a real CR+LF, so we pass it via a small cast.
  await writeTextFile(path, xer.toXERString({ lineEnding: '\r\n' as unknown as '\\r\\n' }));
  return path;
}

/** V2: serialize an XER to a raw string (for tests or in-memory pipelines). */
export function serializeXerText(xer: XER): string {
  return xer.toXERString({ lineEnding: '\r\n' as unknown as '\\r\\n' });
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}
