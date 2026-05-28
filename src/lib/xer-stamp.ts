// XER row-timestamp + user-stamp helpers.
//
// P6's import path uses TASK.update_date to decide whether each row has
// changed since the last sync — if we don't bump it the row's content
// change is silently ignored on import. So whenever the merge engine
// mutates or inserts a TASK row we have to bump update_date (and rewrite
// update_user) to "now".
//
// update_user is a free-form string column in XER (P6 doesn't validate it
// against a user list), so we use it to carry an audit trail:
//
//     {author} | {operator}@p6difftool
//
//   author    -- the value already in the branch row's update_user (the
//                person who actually made the edit). Preserved, never
//                invented.
//   operator  -- the OS user (or whatever the user typed in the operator
//                field in the top bar) who ran the merge.
//   p6difftool -- literal, so it's obvious this row was touched by us.
//
// Parts gracefully degrade when missing:
//   author + operator       -> "jdoe | lleejr@p6difftool"
//   author only             -> "jdoe | p6difftool"
//   operator only           -> "lleejr@p6difftool"
//   neither                 -> "p6difftool"

export function xerStampNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function formatUpdateUser(author: string | undefined, operator: string | undefined): string {
  const op = operator?.trim();
  const tool = op ? `${op}@p6difftool` : 'p6difftool';
  const a = author?.trim();
  return a ? `${a} | ${tool}` : tool;
}

/** Stamp an updateTaskRow patch with the current modification timestamp and
 * a composed update_user. `author` is the original editor (typically read
 * from the branch row's existing update_user). */
export function stampTaskUpdate(
  patch: Record<string, string | number>,
  author: string | undefined,
  operator: string
): void {
  patch.update_date = xerStampNow();
  patch.update_user = formatUpdateUser(author, operator);
}

/** Stamp a freshly-built TASK row (typically copied from the branch table
 * before insertTaskRow). The branch's update_user is taken as the author.
 * create_date / create_user are intentionally NOT overwritten — the row's
 * original creator should remain on record; only update_date /
 * update_user are rewritten to reflect the merge. If the source row was
 * missing create_date / create_user (defensive fallback) we fill them with
 * "now" and the operator tag respectively. */
export function stampTaskInsert(
  values: Record<string, string>,
  operator: string
): void {
  const now = xerStampNow();
  const sourceAuthor = values.update_user;
  values.update_date = now;
  values.update_user = formatUpdateUser(sourceAuthor, operator);
  if (!values.create_date) values.create_date = now;
  if (!values.create_user) values.create_user = formatUpdateUser(undefined, operator);
}
