# DESIGN_DOC

## Goal

Build a Tauri markdown note app where Rust owns behavior and Svelte is only presentation/input wiring.
This app now lives in a monorepo and reuses shared frontend packages and a shared Rust core crate.
Besides the tab-based client, the monorepo also ships a sticky variant where each note can run in its own always-on-top window.

## Implemented Feature Set

### 1. Tab lifecycle

- New note creates an immediate blank tab with `tmp-N` title.
- Tabs keep `tab_id`, `title`, `is_temp`, `is_dirty`, `linked_path`, `content`, and `cursor`.
- Tab close removes in-memory state and temp artifacts for temp tabs.

### 2. File lifecycle

- Open file reads markdown into a new tab.
- Save writes to linked path (fails for unsaved temp tabs).
- Save As writes to selected path, updates tab title/path, marks non-temp, and removes old temp file.

### 3. Autosave + recovery

- Unsaved temp tabs autosave to temp files with debounce (~700ms).
- Session manifest (`session.json`) stores open tabs and sequence.
- Startup restores last session, including tab order and editor content/cursor.
- App close triggers session persist from Rust window close handler.

### 4. UI responsibilities

- Svelte renders toolbar, tab strip, dirty indicator (`*`), and editor.
- CodeMirror 6 provides markdown editing in webview.
- UI sends commands to Rust and updates local render state from returned DTOs.

### 5. Sticky window behavior (`note-markdown-sticky`)

- Every sticky is a single `TabDto`; window labels follow `sticky-{tab_id}`.
- Startup calls `list_restore_session()`: first sticky hydrates in the current window, remaining stickies open in separate windows.
- `+` creates a new note (`new_note`) and immediately opens a new sticky window.
- Save uses `save_tab`; for temp notes it falls back to `save_tab_as` with default filename `sticky`.
- Close (`x` or `Ctrl/Cmd+W`) asks confirmation for dirty notes, except empty temp notes and the single recoverable temp note.
- Markdown content can be copied to clipboard (`Ctrl/Cmd+Shift+C`) with short visual feedback.
- Sticky style is persisted per tab in `localStorage` (`note-markdown-sticky-style-v1`) with color + opacity.
- Sticky window size is persisted in `localStorage` (`note-markdown-sticky-window-size-v1`) and restored on next launch.

## Monorepo Reuse

- Frontend shared packages:
  - `shared/note-shared-types`
  - `shared/note-shared-api`
  - `shared/note-shared-state`
  - `shared/note-shared-editor`
- Rust shared core:
  - `shared/note-core` (`domain`, `services`, `infra`)
- App specific:
  - `note-markdown-client/src/App.svelte`
  - `note-markdown-client/src-tauri/src/commands/mod.rs`
  - `note-markdown-sticky/src/App.svelte`
  - `note-markdown-sticky/src-tauri/src/commands/mod.rs`

## Data Flow

1. UI action -> Tauri command.
2. Command -> Rust service method.
3. Service mutates domain state and filesystem/session artifacts.
4. Service returns DTO -> UI store updates -> rerender.

## Public Command Contract

- `new_note() -> TabDto`
- `open_file(path?) -> TabDto`
- `save_tab(tab_id) -> SaveResultDto`
- `save_tab_as(tab_id, target_path?) -> SaveResultDto`
- `update_tab_content(tab_id, content, cursor) -> Ack`
- `close_tab(tab_id) -> Ack`
- `list_restore_session() -> Vec<TabDto>`
- `persist_session() -> Ack`

## Design Choices (DRY/SOLID)

- Filesystem dependency is abstracted with a trait for testability.
- App service centralizes note behavior; commands are thin adapters.
- DTO conversion is centralized in domain types to avoid repeated mapping logic.

## Known Limits

- Rust-side native file picker is not implemented; UI uses dialog plugin and passes paths.
- No merge/conflict handling if underlying file changes externally while open.
