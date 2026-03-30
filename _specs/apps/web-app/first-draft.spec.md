# Spec for web-app

branch: feature/web-app

## Summary

A browser-based markdown workspace editor built with Svelte + Vite. The app runs as a standalone tray application (no npm required for end users) and supports three file-access modes depending on the browser:

1. **Server mode** — A local REST API on `localhost:1422` provides full read/write file access. In development this is the Vite dev server middleware (`fileSystemPlugin`); in production this is the embedded Axum server inside the `note-web-tray` Tauri binary. Works in any browser.
2. **FSA mode** — Uses the Web File System Access API (`showDirectoryPicker`). Works in Chrome/Edge. Handle is persisted in IndexedDB.
3. **Fallback mode** — Uses `<input webkitdirectory>` to load files. Read-only with download-on-save. File contents cached in IndexedDB.

## Functional Requirements

The functional requirements can be found at `_requirements/apps/web-app-requirements.md`

## Architecture

### Directory structure

**web-app** (Svelte frontend, werkt in elke browser):
```
apps/web-app/
├── index.html
├── package.json
├── vite.config.mts
├── svelte.config.js
├── tsconfig.json
├── src-vite/
│   └── fileSystemPlugin.ts     # Vite plugin: REST API middleware (dev only)
└── src/
    ├── main.ts
    ├── ambient.d.ts             # webkitdirectory type augmentation
    ├── App.svelte               # Root: mode detection, layout, save
    ├── services/
    │   ├── serverApi.ts         # fetch wrappers for /api/* endpoints
    │   ├── fsAccess.ts          # File System Access API helpers
    │   └── workspacePersistence.ts  # IDB + localStorage persistence
    └── lib/
        ├── stores/
        │   └── workspace.ts     # WorkspaceState discriminated union
        └── components/
            ├── WorkspacePicker.svelte   # First-launch / mode selection
            ├── FolderBrowser.svelte     # Dark in-app folder browser
            ├── FileList.svelte          # Tree view with collapse
            ├── TabBar.svelte            # Horizontal tab strip
            └── CollapseToggle.svelte    # Sidebar collapse button
```

**note-web-tray** (Tauri tray binary, vervangt pnpm run voor eindgebruikers):
```
apps/note-web-tray/
├── package.json                 # @tauri-apps/cli devDependency
└── src-tauri/
    ├── Cargo.toml               # tauri, axum, rust-embed, open, mime_guess
    ├── build.rs
    ├── tauri.conf.json          # geen venster; beforeBuildCommand bouwt web-app
    ├── icons/
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs
        ├── lib.rs               # tray setup + server starten + browser openen
        └── server.rs            # Axum HTTP server: statische bestanden + REST API
```

**Samenwerking dev vs productie:**
| | Dev (`pnpm web-app:dev`) | Productie (`note-web-tray`) |
|---|---|---|
| Frontend serveren | Vite dev server | rust-embed in Axum |
| REST API | `fileSystemPlugin` middleware | Axum route handlers in `server.rs` |
| Workspace config | `.workspace.json` in CWD | app data dir van OS |
| Browser openen | Handmatig naar `localhost:1422` | Tray-icoon klik |

### REST API (server mode)
| Endpoint | Method | Description |
|---|---|---|
| `/api/workspace` | GET | Returns `{path, name}` or `null` |
| `/api/workspace` | POST | Validates and saves workspace config |
| `/api/files` | GET | Scans workspace for `.md` files recursively |
| `/api/file?path=...` | GET | Reads file content |
| `/api/file?path=...` | PUT | Writes file content |
| `/api/list-dirs?path=...` | GET | Lists subdirectories (defaults to home dir) |

### Workspace mode priority (on mount)
1. Check if `/api/workspace` is reachable → server mode
2. Try `loadDirectoryHandle()` from IndexedDB, request permission → FSA mode
3. Try `loadFallbackWorkspace()` from IndexedDB → fallback mode
4. Show `WorkspacePicker` if nothing found

### CSS layout
```
grid-template-rows: auto 1fr
grid-template-columns: 28px var(--sidebar-width, 220px) 1fr
```
- Column 0 (28px fixed): `CollapseToggle` — always visible
- Column 1 (`--sidebar-width`): `FileList` + `WorkspaceFooter` — collapses to 0 with CSS transition
- Column 2: `TabBar` (row 0) + `MarkdownEditor` (row 1)

The sidebar column uses `display: flex; flex-direction: column` so `FileList` fills remaining space (`flex: 1`) and the workspace footer is pinned to the bottom (`flex-shrink: 0`).

## Possible Edge Cases

- **Brave browser**: `showDirectoryPicker` removed from `window` by fingerprinting protection → server mode or fallback mode required
- **Folder collapse reactivity**: Svelte `Set` mutation with same reference does not trigger `$:` reactive statements → always create a new `Set` instance on toggle
- **Folder collapse persistence timing**: a Svelte `$:` save block runs at component init (before `onMount`) and would overwrite the saved state with an empty set — save only inside `toggleFolder`, load only in `onMount`
- **CRLF line endings**: CodeMirror 6 normalises `\r\n` → `\n` internally; files read from disk on Windows with CRLF would fail the `tab.content === value` equality check in `syncContent`, causing a false dirty flag — normalise with `content.replace(/\r\n/g, "\n")` when reading
- **Fallback mode persistence**: `File` objects from `<input webkitdirectory>` cannot be stored in IndexedDB → read all file contents immediately and cache as plain text strings
- **Path traversal in server mode**: `abs.startsWith(config.path)` check prevents reading files outside the workspace
- **Permission revoked**: If FSA handle exists in IDB but permission was revoked, re-request with `requestPermission({ mode: 'readwrite' })`
- **No subfolders**: `/api/list-dirs` returns empty `dirs` array; FolderBrowser shows "No subfolders" message
- **Non-null assertion in Svelte template**: `listing!.parent!` causes parse errors; use `{@const parent = listing.parent}` inside `{#if listing?.parent}` instead
- **Last-open-path missing from workspace**: path stored in `last-open-path` may no longer exist if files were deleted or workspace changed — verify with `ws.files.some(f => f.path === lastPath)` before calling `onFileClick`

## Acceptance Criteria

- [ ] App loads at `http://localhost:1422` in development (`pnpm web-app:dev`) en via de `note-web-tray` binary
- [ ] `note-web-tray` binary start zonder Node.js of pnpm; tray-icoon verschijnt in de systeembalk
- [ ] Links klikken op het tray-icoon opent `http://localhost:1422` in de standaardbrowser
- [ ] Tray-menu toont "Open in browser" en "Quit"; Quit sluit de server en de app
- [ ] First launch: WorkspacePicker shown; server mode shows path input + Browse button + recent workspaces list
- [ ] FolderBrowser overlay is dark-themed and allows navigating directories
- [ ] After selecting a workspace, FileList shows all `.md` files in a collapsible tree
- [ ] Clicking a file opens it in a new tab with the MarkdownEditor loaded
- [ ] Typing marks the tab dirty (• indicator in tab and file list); opening a file does NOT mark it dirty
- [ ] Ctrl+S saves the file to disk (server/FSA mode) or triggers download (fallback)
- [ ] Reloading the page reopens the last workspace and the last active tab without going through WorkspacePicker
- [ ] Folder collapse states are preserved across page reloads, namespaced per workspace
- [ ] Sidebar collapse toggle hides FileList and workspace footer; editor expands to fill the width (animated)
- [ ] Workspace footer shows workspace name (default "workspace1") and a button to switch workspace
- [ ] Recent workspaces list appears in WorkspacePicker after at least one workspace has been opened
- [ ] App works in Brave, Chrome, Edge, and Firefox (server mode)

## Open Questions

- Should the recent workspaces list have a maximum size (e.g. last 5)?

## Testing Guidelines

**web-app** — create test files in `apps/web-app/tests/`:

- `fileSystemPlugin` REST API: mock `fs` and verify each endpoint returns correct status codes and JSON shapes
- `workspacePersistence`: verify `saveWorkspaceName`/`loadWorkspaceName` round-trip via localStorage mock; verify `loadRecentWorkspaces` returns max N items sorted by recency
- `fsAccess.buildFallbackEntries`: given a `FileList`-like input, verify correct `FileEntry[]` structure and root name extraction
- `FileList` tree builder: given flat `FileEntry[]` with nested paths, verify `buildTree` produces correct folder/file hierarchy
- `FileList` collapse persistence: verify `onMount` restores collapsed state from localStorage; verify `toggleFolder` saves updated state; verify `$:` init does NOT overwrite saved state
- `FolderBrowser`: verify that clicking a directory item navigates into it; verify Cancel dispatches `cancel` event
- `restoreLastTab`: verify it opens the correct file after workspace load; verify it does nothing when the stored path is absent from the workspace files

**note-web-tray** — Rust integration tests in `apps/note-web-tray/src-tauri/src/`:

- `server::scan_dir`: given a temp directory with nested `.md` files and hidden files, verify correct `FileEntry[]` output (hidden files excluded, sorted)
- `server::has_traversal`: verify `..` and `.` segments are rejected; normal paths pass
- REST API routes: spin up the Axum router with a temp config path and verify each endpoint's status code and JSON response shape
- Path traversal in `get_file` / `put_file`: verify requests with `../` in the path return 403
