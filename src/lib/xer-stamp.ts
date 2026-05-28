// XER row-timestamp helpers.
//
// When P6 imports an XER file it uses each TASK row's `update_date` to
// decide whether the row has changed since the last sync — if the
// timestamp matches what P6 already has, the row is treated as unchanged
// and the import skips applying it. So whenever the merge engine mutates
// or inserts a TASK row we have to bump update_date (and update_user) to
// "now" or the imported file will look identical to the existing project
// even though our diff tool sees the change in the file.
//
// xer-parser's updateTaskRow/insertTaskRow do partial column writes, so
// adding these keys to the patch / values dict is enough; if a particular
// XER version doesn't carry one of these columns in its header, the entry
// is silently dropped.

const TOOL_USER = 'p6difftool';

export function xerStampNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Stamp an updateTaskRow patch with the current modification timestamp. */
export function stampTaskUpdate(patch: Record<string, string | number>): Record<string, string | number> {
  patch.update_date = xerStampNow();
  patch.update_user = TOOL_USER;
  return patch;
}

/** Stamp a freshly-built TASK row's create + update timestamps. */
export function stampTaskInsert(values: Record<string, string>): Record<string, string> {
  const now = xerStampNow();
  values.create_date = now;
  values.update_date = now;
  values.create_user = TOOL_USER;
  values.update_user = TOOL_USER;
  return values;
}
