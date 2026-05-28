# P6 Diff Tool

A cross-platform desktop app (macOS, Windows, Linux) for comparing and
merging **Primavera P6 XER** schedule files. You hand it a **trunk** (the
file you trust as the current source of truth) and a **branch** (a file
with proposed changes). It shows a color-coded diff and lets you
cherry-pick which branch changes to land on the trunk; the export is a
new XER that becomes the updated trunk. Optionally supply a **branch
base** (the trunk version the branch was cut from) for high-fidelity
3-way merging with conflict detection.

There is no good open-source tool for this. Schedulers typically resort
to clunky paid tools or manual spreadsheet gymnastics to answer *"what
changed?"* and *"can I take just these few changes?"* — this fills that
gap, in a single small desktop app.

---

## Features

### Load files

- **Pick** with the file dialog, or **drag-and-drop** an `.xer` file onto
  the top bar. Empty slots fill in order — Trunk first, then Branch,
  then the optional Branch base. Drop multiple files at once to fill
  several slots in one go. The slot that will receive the drop is
  highlighted with a cyan dashed outline while you drag.
- **Swap** Trunk and Branch with one click if you loaded them in the
  wrong order.

### Diff views — every category

- **Color-coded** at the row level: <kbd>added</kbd> (green),
  <kbd>removed</kbd> (red), <kbd>modified</kbd> (amber), <kbd>unchanged</kbd>.
- **Field-level expansion** on modified rows: click to see exactly which
  fields changed and the old → new values, side by side.
- **Filters & search**: chips to scope by status (Changes only / All /
  added / removed / modified), plus a free-text search across IDs and
  names. Tables are virtualized to stay smooth on large schedules.
- **Six categories**, each matched on stable user-facing identifiers (so
  the diff survives across exports and databases):

  | Category | Source | Match key | Compared fields |
  |---|---|---|---|
  | Activities | `TASK` | `task_code` (Activity ID) | name, type, status, % complete, original / remaining duration, planned + actual start/finish, total + free float, constraint, calendar, WBS path |
  | Logic | `TASKPRED` | (predecessor, successor, type) — both as `task_code` | lag |
  | WBS | `PROJWBS` | WBS path **excluding the project root** | name, short name |
  | Resources | `RSRC` | `rsrc_short_name` | name, type, calendar |
  | Calendars | `CALENDAR` | `clndr_name` | type, default, hours/day |
  | Project | `PROJECT` | `proj_short_name` | data date, planned start, planned finish |

  The project short name is deliberately **not** part of any match key —
  comparing a schedule that's been renamed (e.g. `P1` → `P1_REV2`) still
  aligns activity / logic / WBS rows correctly. The project itself is
  diffed as a single row in the Overview / project summary.

### Project status dashboard

Side-by-side **Trunk** vs **Branch** metrics: data date, planned
start/finish, schedule % complete, activities by status (not started / in
progress / completed), milestone count, critical activities (TF ≤ 0),
relationship / WBS / resource / calendar totals. Differing rows are
highlighted in amber.

### Merge a branch into a trunk

#### 2-way mode (trunk + branch)

The merged output **starts from the trunk** and selectively applies the
branch's changes. Each row in Activities / Logic has an **Apply**
checkbox with a status-aware default:

| Branch did | Default | Why |
|---|---|---|
| **Added** a row | Apply ✓ | Bring the new row into the trunk |
| **Modified** a row | Apply ✓ | Use the branch's values |
| **Removed** a row | Skip ☐ | Without a branch base we can't tell "branch deleted it" from "trunk added it later" — defaulting to **skip** protects trunk data. Tick the box if you confirm the deletion. |

Uncheck (or check) any row to override. **Bulk Apply all / Apply none**
in each tab's toolbar acts on the currently-shown rows, so you can scope
by filter + search before flipping in one click. A live counter in the
top bar shows *N apply · M skip*.

#### 3-way mode (trunk + branch + branch base)

Load a Branch base — the trunk version the branch was cut from — and
the engine switches to a **3-way merge** where every change is
attributable:

- *Clean* changes (branch modified a field, trunk hasn't touched it) are
  applied automatically.
- *No-op* changes (trunk already matches branch's new value) are
  detected and ignored.
- *Conflicts* (trunk has diverged from the base in a way branch also
  touched) are surfaced on a dedicated **Conflicts** tab with four
  kinds — add/add, modify/delete, delete/modify, modify/modify — and
  per-row "Take branch / Keep trunk" plus per-field [Branch] [Trunk]
  [Base] buttons. Bulk "Take branch / Keep trunk" resolves a whole
  section at once. The export button stays disabled until every
  conflict has a decision.

#### Export

**Export updated trunk…** opens the save dialog and writes a valid XER
that re-parses cleanly. The button is disabled and a spinner + phase
label appear while it runs:

| Phase | What you see |
|---|---|
| Working | <kbd>⌛ Exporting…</kbd> button + striped progress bar |
| Choose location | Status: *"Choose where to save…"* + native save dialog |
| Done | Status: *"Saved (3 changes applied) → /path/to/trunk-updated.xer"* |

Every merge path preserves the original `ERMHDR` header and table /
column order, and remaps internal `proj_id` / `task_id` / `pred_task_id`
references so the merged trunk is self-consistent even when the source
files used different internal IDs for the same logical project.

#### Audit trail in `update_user`

Every TASK row the merge engine writes (modified *or* inserted) gets its
`update_user` rewritten to a composed audit stamp:

```
{original editor} | {operator}@p6difftool
```

`original editor` is the value already on the branch row (the person who
actually made the change), `operator` is a free-text field in the top
bar that defaults to the OS user — change it to whatever you want
recorded. `create_user` on inserted rows is **preserved unchanged** so
the activity's original creator stays on record. `update_date` is also
bumped to "now" on every mutation, which is what makes P6 actually pick
up the change on import (P6 uses `update_date` to decide whether a row
needs re-applying — if we leave it at the value already in the trunk it
silently skips our edits).

### UI

- Dark, modern theme tuned for long reading sessions; cyan accent on
  primary actions.
- Native title bar (with a dark theme hint where supported) so window
  drag, resize, and minimize/maximize/close work the way you expect on
  each OS.
- Rendering is deliberately restricted to widely-supported CSS (flexbox,
  `position: sticky`, solid backgrounds, `box-shadow`) so the app looks
  identical on Chromium (Electron-style), WKWebView (macOS), WebView2
  (Windows), and WebKitGTK 4.1 (Linux).

---

## Install

Pre-built installers for every platform are produced by CI on every push.
Open the repository's **Actions** tab, pick the latest successful `build`
run, and download the artifact for your OS:

| OS | Artifact |
|---|---|
| macOS (Apple Silicon) | `P6-Diff-Tool-aarch64-apple-darwin.dmg` |
| macOS (Intel) | `P6-Diff-Tool-x86_64-apple-darwin.dmg` |
| Windows | `P6-Diff-Tool.exe` — single self-contained portable exe (no installer) |
| Linux | `.AppImage` and `.deb` |

The macOS `.dmg` is repackaged in CI to include a clearly-marked
**READ ME FIRST.txt** with the one-line command to lift the Gatekeeper
restriction on the unsigned app.

### First launch on macOS

The CI builds are unsigned (no Apple Developer certificate), so macOS
quarantines the app on first launch. After dragging the app to
Applications, open Terminal and paste:

```sh
xattr -dr com.apple.quarantine "/Applications/P6 Diff Tool.app"
```

Or, no Terminal: try to open the app, click **Done** on the warning, then
**System Settings → Privacy & Security → Open Anyway**.

### First launch on Windows

The Windows build is a single **portable** `.exe` — no install step. Download
`P6-Diff-Tool.exe` from the CI artifact and double-click it. Since the build
is unsigned, Windows SmartScreen shows a warning on first launch; click
**More info → Run anyway**.

The only host requirement is **Microsoft WebView2**, which ships with every
modern Windows 10 build and all of Windows 11. If by chance it's missing,
download the Evergreen Bootstrapper from Microsoft and the app will pick it
up automatically.

---

## Usage

1. Load the **Trunk** (current source of truth) — click "Choose Trunk"
   or drag a `.xer` file onto the top bar.
2. Load the **Branch** (file with proposed changes) the same way. The
   **Overview** tab now shows the project status side-by-side plus
   diff-summary counts per category.
3. Optionally load a **Branch base** for high-fidelity 3-way merging.
4. Open any category tab (**Activities**, **Logic**, **WBS**,
   **Resources**, **Calendars**) to see the row-by-row diff. Modified
   rows expand to show field-level changes; use the filter chips and
   search box to focus.
5. In 2-way mode: tick / untick the **Apply** box per row in Activities
   and Logic. In 3-way mode: resolve any conflicts in the **Conflicts**
   tab.
6. Click **Export updated trunk…** in the top bar to save the merged
   file as the new trunk.

Try it with the sample fixtures in [`test-data/`](test-data/) —
`sample-baseline.xer` makes a good trunk and `sample-revised.xer` makes a
good branch. Add `sample-target.xer` as the Branch base to switch into
3-way mode and exercise every conflict kind.

---

## Development

### Prerequisites

- Node.js 18+ and npm
- Rust stable ([rustup](https://rustup.rs))
- **Linux only**: WebKitGTK 4.1 and friends —

  ```sh
  sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev patchelf \
    build-essential libssl-dev libgtk-3-dev libxdo-dev \
    libayatana-appindicator3-dev
  ```

### Commands

```sh
npm install                 # install JS deps
npm run dev                 # frontend only (Vite, no Tauri) — for quick CSS tweaks
npm run tauri:dev           # full desktop app in dev mode (use this normally)
npm run build               # type-check + build the web bundle
npm run tauri:build         # produce native installers for the host OS
npm test                    # Vitest unit tests for diff + merge engines
node test-data/build-fixtures.mjs   # regenerate the synthetic XER fixtures
```

### Project layout

```
.github/workflows/build.yml   Cross-platform CI matrix
src/
  lib/diff/                   Diff engine — per-entity diff modules + shared types
  lib/merge.ts                Merge engine (accept/reject → merged XER)
  lib/summary.ts              Per-file status metrics
  lib/xer.ts                  Tauri dialog + fs glue around xer-parser
  components/                 UI: file picker, dashboard, virtualized DiffTable, tabs
  index.css                   Theme: dark palette, diff row tints, progress bar keyframes
src-tauri/                    Rust shell (minimal: window + dialog + fs plugins)
  capabilities/default.json   Tauri 2 permissions (incl. fs:scope "**")
  tauri.conf.json             Bundle targets per platform + theme: "Dark"
build/                        App icon source + macOS first-launch README
test-data/                    Synthetic XER fixtures (used by tests and demos)
```

### Tests

The diff and merge engines are covered by 24 Vitest tests that run against
the synthetic fixtures in `test-data/`:

- **15 diff tests**: assert exact added / removed / modified
  classification + field-level changes for every entity category.
- **9 merge tests**: assert each revert path (modify / add / remove for
  both activities and logic) produces the right merged XER, and that the
  serialized output re-parses cleanly.

`npm test` runs the suite (also runs in CI on every push).

---

## Cross-platform CI

`.github/workflows/build.yml` runs on every push, pull request, and via
manual dispatch. It builds in parallel on a four-leg matrix:

- `macos-latest` — Apple Silicon (`aarch64-apple-darwin`)
- `macos-latest` — Intel (`x86_64-apple-darwin`)
- `ubuntu-latest`
- `windows-latest`

Each leg installs Rust + Node, builds via
[`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) in
build-only mode (no GitHub release), and uploads the installers as
artifacts.

On macOS legs, the DMG is repackaged with
[`create-dmg`](https://github.com/create-dmg/create-dmg) to bundle the
first-launch README alongside the `.app` and the Applications shortcut, so
end users get the Gatekeeper-lift command directly when they mount the
disk image.

---

## Tech stack

- [**Tauri 2**](https://v2.tauri.app) — native shell using each OS's
  WebView (WKWebView / WebView2 / WebKitGTK 4.1). Rust crates: `tauri`,
  `tauri-plugin-dialog`, `tauri-plugin-fs`. Rust never parses XER — it's
  the native shell + file dialog + filesystem read/write only.
- **React 18 + TypeScript + Vite** — frontend, runs in the WebView.
- [**xer-parser**](https://github.com/Jaggelas/xer-parser) (MIT) — parses
  XER text into rich typed entities and supports round-trip serialization
  plus row-level mutation helpers, which the merge engine uses for
  export.
- **TanStack Table + TanStack Virtual** — virtualized diff grids that
  stay smooth on large schedules.
- **Tailwind CSS** — small custom palette (`bg.base/surface/raised/hover`,
  `ink-50..500`, `line/line-strong`, `accent.*`) on top of Tailwind's
  defaults.
- **Vitest** — unit tests for the diff and merge engines.

---

## Current scope and known limitations

Revertable from the UI today (Activities and Logic tabs):

- **Activities**: name, type, status, % complete, durations, planned and
  actual start/finish, total/free float, constraint type/date — plus full
  add/remove rows.
- **Logic / Relationships**: lag, plus added/removed rows.

Not yet revertable from the UI (the diff is still shown):

- WBS, Resources, Calendars, Project-level changes. These often involve
  structural joins (e.g. moving an activity between WBS nodes requires
  resolving `wbs_id`s) and are deferred to a follow-up.
- Calendar day-pattern detail (working hours, exceptions) — diffed at a
  shallow level only (name, default, hours/day).

Distribution: builds are unsigned. Production distribution should add an
Apple Developer ID + notarization (macOS) and a code-signing certificate
(Windows).

---

## License

The application itself is open source. The `xer-parser` dependency is
MIT-licensed. The `.xer` format is Oracle Primavera P6's proprietary
exchange format; this tool only reads and writes the format and is not
affiliated with Oracle.
