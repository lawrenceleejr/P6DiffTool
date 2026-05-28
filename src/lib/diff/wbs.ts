import type { XER } from 'xer-parser';
import {
  diffByKey,
  type WbsRecord,
  type CategoryDiff
} from './types';

const pathCache = new WeakMap<XER, Map<number, string>>();

/** Resolve the full WBS path ("Project / Phase / Task") for a wbsId, with
 * memoization per XER instance. */
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
    parts.unshift(String(current.wbsShortName ?? current.wbsName ?? current.wbsId));
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
    const project = (w as any).project;
    const path = wbsPathForId(xer, w.wbsId);
    const rec: WbsRecord = {
      path,
      shortName: String(w.wbsShortName ?? ''),
      name: String(w.wbsName ?? ''),
      projectShortName: String(project?.projShortName ?? '')
    };
    map.set(`${rec.projectShortName}::${path}`, rec);
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
