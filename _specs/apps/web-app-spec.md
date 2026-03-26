# Spec for web-app

branch: feature/web-app

## Summary

A browser-based markdown workspace editor built with Svelte + Vite. The app runs as a standalone tray application (no npm required for end users) and supports three file-access modes depending on the browser:

1. **Server mode** — Vite dev server (or packaged server) exposes a local REST API over Node.js. Works in any browser with full read/write access. Workspace path is stored in `.workspace.json`.
2. **FSA mode** — Uses the Web File System Access API (`showDirectoryPicker`). Works in Chrome/Edge. Handle is persisted in IndexedDB.
3. **Fallback mode** — Uses `<input webkitdirectory>` to load files. Read-only with download-on-save. File contents cached in IndexedDB.

## Functional Requirements

The functional requirements can be found at `_requirements/apps/web-app-requirements.md`

## Architecture

### Directory structure
```
apps/web-app/
├── index.html
├── package.json
├── vite.config.mts
├── svelte.config.js
├── tsconfig.json
├── src-vite/
│   └── fileSystemPlugin.ts     # Vite plugin: REST API middleware
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
- Column 1 (`--sidebar-width`): `FileList` — collapses to 0 with CSS transition
- Column 2: `TabBar` (row 0) + `MarkdownEditor` (row 1)

## Possible Edge Cases

- **Brave browser**: `showDirectoryPicker` removed from `window` by fingerprinting protection → server mode or fallback mode required
- **Folder collapse reactivity**: Svelte `Set` mutation with same reference does not trigger `$:` reactive statements → always create a new `Set` instance on toggle
- **Fallback mode persistence**: `File` objects from `<input webkitdirectory>` cannot be stored in IndexedDB → read all file contents immediately and cache as plain text strings
- **Path traversal in server mode**: `abs.startsWith(config.path)` check prevents reading files outside the workspace
- **Permission revoked**: If FSA handle exists in IDB but permission was revoked, re-request with `requestPermission({ mode: 'readwrite' })`
- **No subfolders**: `/api/list-dirs` returns empty `dirs` array; FolderBrowser shows "No subfolders" message
- **Non-null assertion in Svelte template**: `listing!.parent!` causes parse errors; use `{@const parent = listing.parent}` inside `{#if listing?.parent}` instead

## Acceptance Criteria

- [ ] App loads at `http://localhost:1422` (dev) or via packaged tray binary
- [ ] First launch: WorkspacePicker shown; server mode shows path input + Browse button + recent workspaces list
- [ ] FolderBrowser overlay is dark-themed and allows navigating directories
- [ ] After selecting a workspace, FileList shows all `.md` files in a collapsible tree
- [ ] Clicking a file opens it in a new tab with the MarkdownEditor loaded
- [ ] Typing marks the tab dirty (• indicator in tab and file list)
- [ ] Ctrl+S saves the file to disk (server/FSA mode) or triggers download (fallback)
- [ ] Reloading the page reopens the last workspace without going through WorkspacePicker
- [ ] Sidebar collapse toggle hides FileList; editor expands to fill the width (animated)
- [ ] Recent workspaces list appears in WorkspacePicker after at least one workspace has been opened
- [ ] App works in Brave, Chrome, Edge, and Firefox (server mode)

## Open Questions

- How should the tray app be packaged? Options: Tauri tray app (wraps the Vite build), Electron, or a lightweight Node.js HTTP server bundled as a single executable.
- Should the tray app bundle its own server, or rely on a separately running Vite/Node process?
- Should the recent workspaces list have a maximum size (e.g. last 5)?

## Testing Guidelines

Create test files in `./tests` for the following cases:

- `fileSystemPlugin` REST API: mock `fs` and verify each endpoint returns correct status codes and JSON shapes
- `workspacePersistence`: verify `saveWorkspaceName`/`loadWorkspaceName` round-trip via localStorage mock; verify `loadRecentWorkspaces` returns max N items sorted by recency
- `fsAccess.buildFallbackEntries`: given a `FileList`-like input, verify correct `FileEntry[]` structure and root name extraction
- `FileList` tree builder: given flat `FileEntry[]` with nested paths, verify `buildTree` produces correct folder/file hierarchy
- `FolderBrowser`: verify that clicking a directory item navigates into it; verify Cancel dispatches `cancel` event
