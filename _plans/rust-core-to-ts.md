# Plan: Port Rust Core to TypeScript + Monorepo Restructure

## Context

The current monorepo has core note-taking logic (tab lifecycle, session persistence, autosave) implemented in Rust (`shared/note-core`), accessible only via Tauri IPC. To support a future web app, Electron app, and mobile app, this logic needs a TypeScript equivalent.

Additionally, all TypeScript shared packages currently live in `shared/` alongside Rust crates — they should move to `packages/` following classic monorepo conventions.

**Goal:** Platform-agnostic TypeScript AppService + clean `packages/` structure, without breaking the existing Tauri apps.

---

## Target Structure

```
note-markdown/
├── apps/
│   ├── note-markdown-client/    (unchanged internals, updated deps)
│   └── note-markdown-sticky/    (unchanged internals, updated deps)
├── packages/
│   ├── types/      → @note/types    (was @note/shared-types)
│   ├── core/       → @note/core     (NEW: TypeScript AppService)
│   ├── api/        → @note/api      (was @note/shared-api, now platform-agnostic)
│   ├── state/      → @note/state    (was @note/shared-state)
│   ├── utils/      → @note/utils    (was @note/shared-utils)
│   └── editor/     → @note/editor   (was @note/shared-editor)
├── shared/
│   ├── note-core/              (Rust — keep as-is)
│   └── note-tauri-commands/    (Rust — keep as-is)
└── pnpm-workspace.yaml
```

---

## Phase 1: Move TypeScript Packages to `packages/`

**No behavioral changes — only renames and path updates.**

### Steps

**1.1** Update `pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
```
Remove the flat `note-markdown-client`, `note-markdown-sticky` entries and `shared/*`.

**1.2** For each package, create `packages/{name}/` and move source files:

| From | To | New package name |
|------|-----|-----------------|
| `shared/note-shared-types/` | `packages/types/` | `@note/types` |
| `shared/note-shared-state/` | `packages/state/` | `@note/state` |
| `shared/note-shared-utils/` | `packages/utils/` | `@note/utils` |
| `shared/note-shared-editor/` | `packages/editor/` | `@note/editor` |
| `shared/note-shared-api/` | `packages/api/` | `@note/api` |

Update `name` field in each `package.json` accordingly.

**1.3** In both `apps/note-markdown-client/package.json` and `apps/note-markdown-sticky/package.json`, update all `@note/shared-*` deps to `@note/*`.

**1.4** Update all import paths in both `App.svelte` files and any other TS/Svelte files referencing old package names.

**1.5** Delete `shared/note-shared-*` directories.

**Verify:** `pnpm install` resolves cleanly; `note-client:dev` and `note-sticky:dev` run.

---

## Phase 2: Create `@note/core` — TypeScript AppService

**Create `packages/core/` with `@note/core`.**

### Source references
- Authoritative logic: `shared/note-core/src/services/app_service.rs`
- Domain models: `shared/note-core/src/domain/tab.rs`
- Existing TS mock (reference): `apps/note-markdown-client/src/mocks/tauri/state.ts`

### `packages/core/src/FileSystemAdapter.ts`

```typescript
export interface FileSystemAdapter {
  createDirAll(path: string): Promise<void>;
  readToString(path: string): Promise<string>;
  writeString(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  sessionRoot(appName: string): string;
}
```

### `packages/core/src/AppService.ts`

- Fields: `tabs: Tab[]`, `nextTabId: number`, `nextTempId: number`, `sessionRoot: string`, `fs: FileSystemAdapter`, `lastAutosave: Map<string, number>` (timestamp ms)
- Static async factory: `AppService.create(fs, appName)` — initializes and calls `restoreSession()`
- All 8 methods async: `listTabs`, `newNote`, `openFile`, `updateTabContent`, `saveTab`, `saveTabAs`, `closeTab`, `persistSession`
- Errors: `AppServiceError` with `kind: 'tab_not_found' | 'save_as_required' | 'io' | 'parse'`

**Tab ID generation:** `nextTabId()` returns `"tab-${this.nextTabId++}"` (string prefix, not bare number)

**`updateTabContent` behavior:**
- Updates `content`, `cursor`, and sets `is_dirty = true`
- Only autosaves if `tab.is_temp` — linked-file tabs are never autosaved
- Autosave check: write if `!lastAutosave.has(tabId)` OR `Date.now() - lastAutosave.get(tabId)! >= 700` — first update always writes immediately
- After writing temp file: updates `lastAutosave`, then calls `persistSession()`

**`persistSession` behavior (matches Rust exactly):**
1. Delete temp files for tabs where `is_temp && content === ""` (empty temp tabs)
2. Write temp files for tabs where `is_temp && content !== ""`
3. Build `savedTabs` = tabs filtered to `!is_temp || content !== ""` (skip empty temp tabs)
4. `nextTempId` to save = `savedTabs.some(t => t.is_temp) ? this.nextTempId : 1` (reset to 1 if no temp tabs remain)
5. Write `session.json` with `{ next_tab_id, next_temp_id, tabs: savedTabs }`

**`restoreSession` behavior:**
- If `session.json` does not exist: return (fresh start)
- Parse JSON; on parse error: log and return (fresh start, do not throw)
- Restore `nextTabId`, `nextTempId` from persisted counters
- For each `PersistedTab`: hydrate content from temp file if it exists; fall back to `persistedTab.content` if temp file is missing

**`PersistedTab` type** (add to `@note/types`):
```typescript
type PersistedTab = {
  tab_id: string; title: string; is_temp: boolean; is_dirty: boolean;
  linked_path: string | null; content: string; // fallback if temp file missing
  cursor: number; temp_file_name: string | null;
};
type PersistedSession = {
  next_tab_id: number; next_temp_id: number; tabs: PersistedTab[];
};
```

### `packages/core/package.json`

```json
{ "name": "@note/core", "dependencies": { "@note/types": "workspace:*" } }
```

### Tests (`packages/core/src/AppService.test.ts`)

In-memory `FileSystemAdapter` (a `Map<string, string>`). Cover:
- `newNote` assigns unique `tmp-N` names across calls; tab IDs are `tab-1`, `tab-2`, ...
- First `updateTabContent` on a temp tab immediately writes the temp file (no prior entry = always write)
- Second `updateTabContent` within 700ms does NOT write again (debounce)
- `updateTabContent` on a linked-file (non-temp) tab does NOT write any temp file
- `saveTabAs` updates title, clears temp file, marks `is_dirty: false`, `is_temp: false`
- `persistSession` resets `next_temp_id` to 1 when all temp tabs are closed
- `persistSession` skips empty temp tabs (not written to session.json)
- `restoreSession` recovers tabs, counters, and hydrates temp file content; uses `PersistedTab.content` fallback if temp file missing

---

## Phase 3: Refactor `@note/api` with Platform Adapters

**Evolve `packages/api/` to support multiple platforms.**

### `packages/api/src/adapters/TauriAppServiceAdapter.ts`

Implements `IAppService` by delegating to Tauri `invoke()` — structurally identical to current `@note/shared-api` but satisfies the interface. File dialogs (`openFile`, `saveTabAs`) use `@tauri-apps/plugin-dialog`.

### `packages/api/src/adapters/LocalStorageFsAdapter.ts`

Implements `FileSystemAdapter` using `localStorage` as a virtual filesystem. Keys are paths; values are file content strings. Used by web app and as a drop-in mock for Tauri dev mode.

### `packages/api/src/adapters/OpfsFsAdapter.ts` (optional, web enhancement)

Implements `FileSystemAdapter` using the browser Origin Private File System (OPFS) API. Falls back to `LocalStorageFsAdapter` when OPFS is unavailable.

### `packages/api/src/FilePicker.ts`

```typescript
export interface FilePicker {
  pickFileToOpen(): Promise<string | null>;
  pickFileToSave(defaultPath?: string): Promise<string | null>;
}
```

`TauriFilePicker` wraps `@tauri-apps/plugin-dialog`. `WebFilePicker` uses `<input type="file">` / `showSaveFilePicker()`.

### `packages/api/src/index.ts` — exports

- `createTauriService()` → `TauriAppServiceAdapter`
- `createWebService(appName)` → `AppService.create(new LocalStorageFsAdapter(), appName)`
- All existing function names re-exported (`listRestoreSession`, `newNote`, …) to avoid breaking app code

---

## Phase 4: Update Tauri Apps

1. Replace `@note/shared-api` in both app `package.json` with `@note/api`
2. Update import paths in `App.svelte` (function names are unchanged)
3. Optionally replace `mocks/tauri/state.ts` with `createWebService()` from `@note/api`

---

## Key Files

| File | Role |
|------|------|
| `shared/note-core/src/services/app_service.rs` | Source of truth for AppService logic |
| `shared/note-core/src/domain/tab.rs` | Domain models to mirror in TS |
| `apps/note-markdown-client/src/mocks/tauri/state.ts` | Existing TS reference implementation |
| `pnpm-workspace.yaml` | Must update to `apps/*` + `packages/*` |
| `apps/note-markdown-client/src/App.svelte` | Main consumer of all shared packages |
| `apps/note-markdown-sticky/src/App.svelte` | Main consumer of all shared packages |

---

## Verification

1. `pnpm install` — no resolution errors
2. `pnpm -r build` — all packages compile
3. `note-client:dev` and `note-sticky:dev` — tab creation, editing, save, close, session restore work
4. `@note/core` unit tests pass — autosave, restore, save-as
5. Web page using `createWebService()` — tab operations work without Tauri
