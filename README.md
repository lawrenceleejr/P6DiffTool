# P6 Diff Tool

A cross-platform desktop app (macOS, Windows, Linux) that loads two
**Primavera P6 XER** schedule exports, shows a clear color-coded diff, and
lets you cherry-pick which changes to carry forward into an exported merged
XER file.

There is no good open-source tool for comparing two P6 schedules. Schedulers
typically resort to clunky paid tools or manual spreadsheet gymnastics to
answer simple questions like *"what changed between baseline and revised?"*
or *"can I take just these few changes without the rest?"* — this fills
that gap, in a single small desktop app.

---

## Features

### Load files

- **Pick** with the file dialog, or **drag-and-drop** an `.xer` file onto
  the top bar. The first dropped file fills Baseline; the next fills
  Revised. Drop two at once to fill both in order. The slot that will
  receive the drop is highlighted with a cyan dashed outline while you drag.
- **Swap** baseline and revised with one click.

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

Side-by-side **Baseline** vs **Revised** metrics: data date, planned
start/finish, schedule % complete, activities by status (not started / in
progress / completed), milestone count, critical activities (TF ≤ 0),
relationship / WBS / resource / calendar totals. Differing rows are
highlighted in amber.

### Cherry-pick and export a merged XER

- **"Apply" checkbox** on every changed row in **Activities** and **Logic**.
  Default = apply (output equals the revised file). Uncheck a row to revert
  that one change to the baseline value while leaving everything else
  untouched.
- **Bulk Apply all / Apply none** buttons in each tab's toolbar, scoped to
  whatever is currently shown. Combine with filters or search to quickly
  "apply all date shifts," "revert all logic changes," "revert these three
  matching activities," etc.
- **Live counter** in the top bar: "*N* apply · *M* revert".
- **Export merged XER…** opens the save dialog, then writes a valid XER
  that re-parses cleanly. The button is disabled and a spinner / progress
  strip + phase label appear during the export, so you know exactly what's
  happening:

  | Phase | What you see |
  |---|---|
  | Working | <kbd>⌛ Exporting…</kbd> button + striped progress bar |
  | Choose location | Status: *"Choose where to save…"* + native save dialog |
  | Done | Status: *"Saved (3 changes reverted) → /path/to/merged.xer"* |

  Every revert path is handled:

  - *Modified* → field values restored to the baseline.
  - *Added* → row deleted from the output.
  - *Removed* → row re-inserted from the baseline's raw `TASK` /
    `TASKPRED` record, with internal `task_id` / `pred_task_id` remapped
    to avoid collisions with the revised file's IDs.

  Serialization preserves the original `ERMHDR` header and table/column
  order.

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

1. **Click** "Choose Baseline" or **drag** a `.xer` file onto the top bar
   to load File A.
2. Load File B the same way. The **Overview** tab now shows the project
   status side-by-side plus diff-summary counts per category.
3. Open any category tab (**Activities**, **Logic**, **WBS**,
   **Resources**, **Calendars**) to see the row-by-row diff. Modified
   rows expand to show field-level changes; use the filter chips and
   search box to focus.
4. On **Activities** and **Logic**, uncheck the **Apply** box on any rows
   you want to *revert* (i.e., keep the baseline value for that row). Use
   **Apply all** / **Apply none** to bulk-set the currently shown rows.
5. Click **Export merged XER…** in the top bar to save the merged file.

Try it with the sample fixtures in [`test-data/`](test-data/) — load
`sample-baseline.xer` and `sample-revised.xer` to see every diff branch
(added, removed, modified activities; added, removed, modified logic;
data-date shift) exercised in a tiny project.

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
