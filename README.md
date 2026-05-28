# P6 Diff Tool

A cross-platform desktop app (macOS, Windows, Linux) that loads two
**Primavera P6 XER** schedule exports, shows a clear color-coded diff, and
lets you cherry-pick which changes to carry forward into an exported merged
XER file.

There is no off-the-shelf, user-friendly tool for comparing two P6 schedules
— this fills that gap. Schedulers can see exactly what changed between a
baseline and a revised schedule (added/removed/changed activities, shifted
dates, altered logic, float erosion) and decide what to keep, all without
leaving the app.

---

## Features

### Diff views

- **Side-by-side load** of two XER files (Baseline / Revised). Swap with one click.
- **Color-coded diff** at the row level: <kbd>added</kbd> (green),
  <kbd>removed</kbd> (red), <kbd>modified</kbd> (amber), <kbd>unchanged</kbd>.
- **Field-level expansion** on modified rows — click to see exactly which
  fields changed and the old → new values.
- **Filters & search**: show only changes, filter by status, full-text search
  across IDs and names. Tables are virtualized to stay smooth at any schedule
  size.
- **Six diff categories**, matched on stable user-facing identifiers (so the
  diff survives across exports and databases):

  | Category | Source table | Match key | Compared fields |
  |---|---|---|---|
  | Activities | `TASK` | `task_code` (Activity ID) + project | name, type, status, % complete, original / remaining duration, planned + actual start/finish, total + free float, constraint, calendar, WBS path |
  | Relationships (logic) | `TASKPRED` | (pred, succ, type) | lag |
  | WBS | `PROJWBS` | WBS path | name, short name |
  | Resources | `RSRC` | `rsrc_short_name` | name, type, calendar |
  | Calendars | `CALENDAR` | `clndr_name` | type, default, hours/day |
  | Project | `PROJECT` | `proj_short_name` | data date, planned start, planned finish |

### Project status dashboard

A side-by-side "Project Status" table with baseline vs revised metrics:
data date, planned start/finish, schedule % complete, activities by status,
milestone / critical activity counts, totals for relationships / WBS /
resources / calendars. Differing rows are highlighted.

### Cherry-pick and export a merged XER

- **Accept / Reject** checkbox per changed row on the Activities and Logic
  tabs. Default = accept (output equals the revised file); uncheck a row to
  revert that one change back to the baseline value.
- **Live counter** in the top bar: "N apply, M revert".
- **Export merged XER…** opens a save dialog and writes a valid XER that
  re-parses cleanly. Every revert path is handled:

  - *Modified* → field values restored to the baseline.
  - *Added* → row deleted from the output.
  - *Removed* → row re-inserted from the baseline's raw `TASK` / `TASKPRED`
    record, with internal IDs remapped to avoid collisions.

  Serialization preserves the original `ERMHDR` header, table and column
  order.

---

## Install

Pre-built installers for every platform are produced by CI on every push.
Open the repository's **Actions** tab, pick the latest successful `build` run,
and download the artifact for your OS:

| OS | Artifact contains |
|---|---|
| macOS (Apple Silicon) | `P6-Diff-Tool-aarch64-apple-darwin.dmg` |
| macOS (Intel) | `P6-Diff-Tool-x86_64-apple-darwin.dmg` |
| Windows | `.msi` (WiX) and `.exe` (NSIS) installers |
| Linux | `.AppImage` and `.deb` |

The macOS `.dmg` includes a clearly-marked `READ ME FIRST.txt` with the
one-line command to lift the Gatekeeper restriction (these builds are
unsigned, so macOS blocks them on first launch).

### First launch on macOS (unsigned build)

After dragging the app to Applications, open Terminal and run:

```sh
xattr -dr com.apple.quarantine "/Applications/P6 Diff Tool.app"
```

Or, no Terminal: try to open the app, then go to **System Settings >
Privacy & Security** and click "Open Anyway" next to the P6 Diff Tool entry.

### First launch on Windows (unsigned build)

The NSIS installer is unsigned, so Windows SmartScreen shows a warning.
Click **More info** > **Run anyway** to install.

---

## Usage

1. Click **Choose Baseline (File A)** in the top bar and pick your earlier XER.
2. Click **Choose Revised (File B)** and pick the newer XER.
3. The **Overview** tab shows the project status side-by-side plus diff
   summary counts per category.
4. Open any category tab (**Activities**, **Logic**, **WBS**, **Resources**,
   **Calendars**) to see the row-by-row diff. Modified rows expand to show
   field-level changes; use the filter chips and search box to focus.
5. On **Activities** and **Logic**, uncheck the **Apply** box on any rows you
   want to *revert* (i.e., keep the baseline value for that row).
6. Click **Export merged XER…** in the top bar to save the merged file.

Try it with the sample fixtures in [`test-data/`](test-data/) — load
`sample-baseline.xer` and `sample-revised.xer` to see every diff branch
(added, removed, modified activities; added, removed, modified logic; data
date shift) exercised in a tiny project.

---

## Development

### Prerequisites

- Node.js 18+ and npm
- Rust stable (install via [rustup](https://rustup.rs))
- Linux only: WebKitGTK 4.1 and friends —

  ```sh
  sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev patchelf \
    build-essential libssl-dev libgtk-3-dev libxdo-dev \
    libayatana-appindicator3-dev
  ```

### Commands

```sh
npm install                 # install JS deps
npm run dev                 # frontend only (Vite, no Tauri)
npm run tauri:dev           # full desktop app in dev mode
npm run build               # type-check + build the web bundle
npm run tauri:build         # produce native installers for the host OS
npm test                    # Vitest unit tests for the diff and merge engines
node test-data/build-fixtures.mjs   # regenerate the synthetic XER fixtures
```

### Project layout

```
.github/workflows/build.yml   Cross-platform CI matrix
src/                          React + TypeScript frontend
  lib/diff/                   Diff engine (per-entity) + types
  lib/merge.ts                Merge engine (accept/reject -> merged XER)
  lib/summary.ts              Per-file status metrics
  lib/xer.ts                  Tauri dialog + fs glue around xer-parser
  components/                 UI: file picker, dashboard, virtualized DiffTable, tabs
src-tauri/                    Rust shell (minimal: window + dialog + fs plugins)
  capabilities/default.json   Tauri 2 permissions (incl. fs:scope "**")
  tauri.conf.json             Bundle targets per platform
build/                        App icon source + macOS first-launch README
test-data/                    Synthetic XER fixtures (used by tests and demos)
```

---

## How the cross-platform build works

`.github/workflows/build.yml` runs on every push, pull request, and via
manual dispatch. It builds in parallel on a four-leg matrix:

- `macos-latest` — Apple Silicon (`aarch64-apple-darwin`)
- `macos-latest` — Intel (`x86_64-apple-darwin`)
- `ubuntu-latest`
- `windows-latest`

Each leg installs Rust + Node, builds via
[`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) in
build-only mode (no GitHub release), and uploads the resulting installers as
build artifacts.

On macOS legs, the DMG is repackaged with
[`create-dmg`](https://github.com/create-dmg/create-dmg) to bundle the
first-launch README alongside the `.app` and the Applications shortcut, so
end users get the Gatekeeper-lift command directly when they mount the disk
image.

---

## Tech stack

- [**Tauri 2**](https://v2.tauri.app) — native shell using each OS's WebView
  (WKWebView / WebView2 / WebKitGTK 4.1). Rust crates `tauri`,
  `tauri-plugin-dialog`, `tauri-plugin-fs`.
- **React 18 + TypeScript + Vite** — frontend, runs in the WebView.
- [**xer-parser**](https://github.com/Jaggelas/xer-parser) (MIT) — parses XER
  text into rich typed entities and supports round-trip serialization plus
  row-level mutation helpers, which the merge engine uses for export.
- **TanStack Table + TanStack Virtual** — virtualized diff grids that stay
  smooth on large schedules.
- **Tailwind CSS** — styling. Limited to widely-supported CSS (flexbox,
  `position: sticky`, `box-shadow`, solid background tints) so rendering is
  consistent across all three WebViews.
- **Vitest** — unit tests for the diff and merge engines, run in CI.

All parsing, diffing, and merging happen in TypeScript in the WebView; Rust
is only the native shell + file dialog + filesystem read/write.

---

## Current scope and known limitations

The merge / export currently reverts these changes:

- **Activities**: name, type, status, % complete, durations, planned and
  actual start/finish, total/free float, constraint type/date.
- **Relationships**: lag, plus added/removed.
- Added or removed activities (re-inserted with new internal IDs to avoid
  collisions).

Not yet revertable from the UI (the data is still shown in the diff):

- WBS, Resources, Calendars, Project-level changes — these often involve
  structural joins (e.g. moving an activity between WBS nodes requires
  resolving `wbs_id`s) and are deferred to a follow-up.
- Calendar day-pattern detail (working hours, exceptions) — the diff
  currently compares calendars at a shallow level (name, default, hours/day).

Distribution: builds are unsigned. Production distribution should add an
Apple Developer ID + notarization (macOS) and a code-signing certificate
(Windows).

---

## License

The application itself is open source. The `xer-parser` dependency is
MIT-licensed. The `.xer` format is Oracle Primavera P6's proprietary
exchange format; this tool only reads and writes the format and is not
affiliated with Oracle.
