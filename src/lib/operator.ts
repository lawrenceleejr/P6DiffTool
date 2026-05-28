// Helper for the merge-stamp "operator" field — the human running the
// merge. Defaults to the OS user; surfaced as an editable text input in
// the top bar so the user can override.

import { invoke } from '@tauri-apps/api/core';

export async function getOsUsername(): Promise<string> {
  try {
    return await invoke<string>('get_os_username');
  } catch {
    // Running outside Tauri (e.g. vite-only dev), or the command is
    // missing for some reason — fall back to empty; the user can type.
    return '';
  }
}
