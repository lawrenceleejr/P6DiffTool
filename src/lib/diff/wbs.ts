import type { XER } from 'xer-parser';
import {
  diffByKey,
  type WbsRecord,
  type CategoryDiff
} from './types';

const pathCache = new WeakMap<XER, Map<number, string>>();

/** Resolve the full WBS path ("Phase / Task") for a wbsId, with memoization
 * per XER instance. The project-root WBS node (whose name is the project
 * short name) is deliberately omitted from the path so the diff aligns
 * rows across files that differ only in project rename / id. */
export function wbsPathForId(xer: XER, wbsId: number): string {
  let cache = pathCache.get(xer);
  if (!cache) {
    cache = new Map<number, string>();
    pathCache.set(xer, cache);
  }
  const cached = cache.get(wbsId);
  if (cached !== undefined) return cached;

  const byId = new Map<number, any>();
  for (const w of xer.projWBS) byId.set(w.wbsId, w);

  const parts: string[] = [];
  let current: any = byId.get(wbsId);
  const seen = new Set<number>();
  while (current && !seen.has(current.wbsId)) {
    seen.add(current.wbsId);
    // Skip the project-root WBS node — its name is the project short name,
    // which we ignore for matching.
    if (!current.projNodeFlag) {
      parts.unshift(String(current.wbsShortName ?? current.wbsName ?? current.wbsId));
    }
    if (current.parentWbsId == null) break;
    current = byId.get(current.parentWbsId);
  }
  const path = parts.join(' / ');
  cache.set(wbsId, path);
  return path;
}

function buildMap(xer: XER): Map<string, WbsRecord> {
  const map = new Map<string, WbsRecord>();
  for (const w of xer.projWBS) {
    // Skip the project-root node entirely — we don't diff the project name.
    if ((w as any).projNodeFlag) continue;
    const project = (w as any).project;
    const path = wbsPathForId(xer, w.wbsId);
    if (!path) continue;
    const rec: WbsRecord = {
      path,
      shortName: String(w.wbsShortName ?? ''),
      name: String(w.wbsName ?? ''),
      projectShortName: String(project?.projShortName ?? '')
    };
    // Key purely by path; no project prefix.
    map.set(path, rec);
  }
  return map;
}

const WBS_FIELDS = [
  { field: 'name', label: 'WBS Name', get: (r: WbsRecord) => r.name },
  { field: 'shortName', label: 'WBS Short Name', get: (r: WbsRecord) => r.shortName }
] as const;

export function diffWbs(oldXer: XER, newXer: XER): CategoryDiff<WbsRecord> {
  return diffByKey(buildMap(oldXer), buildMap(newXer), WBS_FIELDS);
}
