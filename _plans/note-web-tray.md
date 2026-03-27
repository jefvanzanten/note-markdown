# Plan: note-web-tray — Tauri Tray App voor web-app

## Doel

Een Tauri 2 tray applicatie die de web-app draait zonder `pnpm run` commando's.
De app verschijnt als icoon in de systeembalk, toont de web-app in een venster en
beheert het bestandssysteem via Tauri IPC (in plaats van de Vite middleware).

---

## Architectuur

```
apps/note-web-tray/
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── icons/                  # app iconen
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs
        ├── lib.rs
        └── commands.rs         # bestandssysteem IPC commands
```

De Tauri app heeft **geen eigen frontend source**. De `frontendDist` in
`tauri.conf.json` wijst naar `../../web-app/dist`. De `beforeBuildCommand`
bouwt de web-app eerst.

### Hoe serverApi.ts werkt in Tauri

`serverApi.ts` krijgt een `isTauri()` guard. Wanneer de app in Tauri draait,
worden `invoke()` calls gebruikt in plaats van `fetch('/api/...')`. De rest van
`App.svelte` hoeft **niet** aangepast te worden — "server mode" werkt
transparant via Tauri IPC.

```
Browser (dev/prod)          Tauri tray app
──────────────────          ──────────────
fetch('/api/workspace')  →  invoke('get_workspace')
fetch('/api/files')      →  invoke('list_files')
fetch('/api/file')       →  invoke('read_file')
PUT  '/api/file'         →  invoke('write_file')
fetch('/api/list-dirs')  →  invoke('list_dirs')
```

---

## Stappen

### Stap 1 — `serverApi.ts` uitbreiden met Tauri IPC

**Bestand:** `apps/web-app/src/services/serverApi.ts`

- Voeg `isTauri()` helper toe: `'__TAURI_INTERNALS__' in window`
- Per functie: als Tauri → gebruik `invoke()`, anders bestaand `fetch()`
- Voeg `@tauri-apps/api` toe als dependency aan `apps/web-app/package.json`
- Importeer dynamisch (`await import('@tauri-apps/api/core')`) zodat browser builds niet breken

### Stap 2 — Tauri app aanmaken: `apps/note-web-tray/`

#### `src-tauri/Cargo.toml`

```toml
[package]
name = "note-web-tray"
version = "0.1.0"
edition = "2021"

[lib]
name = "note_web_tray_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-tray = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dirs = "5"
```

#### `src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "note-web-tray",
  "version": "0.1.0",
  "identifier": "com.example.note-web-tray",
  "build": {
    "beforeDevCommand": "pnpm --filter web-app run dev",
    "beforeBuildCommand": "pnpm --filter web-app run build",
    "devUrl": "http://localhost:1422",
    "frontendDist": "../../web-app/dist"
  },
  "app": {
    "windows": [
      {
        "title": "Note Markdown",
        "label": "main",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "visible": false
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"]
  }
}
```

#### `src-tauri/src/commands.rs`

Rust implementatie van dezelfde logica als `fileSystemPlugin.ts`:

| Command           | Equivalent Vite endpoint          |
|-------------------|-----------------------------------|
| `get_workspace`   | `GET /api/workspace`              |
| `set_workspace`   | `POST /api/workspace`             |
| `list_files`      | `GET /api/files`                  |
| `read_file`       | `GET /api/file?path=...`          |
| `write_file`      | `PUT /api/file?path=...`          |
| `list_dirs`       | `GET /api/list-dirs?path=...`     |

Workspace config wordt opgeslagen in `app_data_dir()/.workspace.json`
(in plaats van CWD zoals de Vite plugin doet).

#### `src-tauri/src/lib.rs`

- Registreer alle commands via `tauri::generate_handler![]`
- Setup systeem tray via `tauri_plugin_tray`
- Tray menu: **Open**, **Quit**
- Bij "Open": toon het hoofdvenster
- Bij "Quit": `app.exit(0)`
- Venster sluit naar tray (hide) in plaats van afsluiten

#### `src-tauri/capabilities/default.json`

Permissies:
- `core:window:allow-show`
- `core:window:allow-hide`
- `tray:allow-*`
- `core:app:allow-app-handle-plugin` (voor IPC)

### Stap 3 — Root Cargo.toml uitbreiden

```toml
[workspace]
members = [
    "shared/note-core",
    "shared/note-tauri-commands",
    "apps/note-markdown-client/src-tauri",
    "apps/note-markdown-sticky/src-tauri",
    "apps/note-web-tray/src-tauri",   # nieuw
]
```

### Stap 4 — Root `package.json` uitbreiden

```json
"note-web-tray:dev": "pnpm --filter note-web-tray run tauri dev",
"note-web-tray:build": "pnpm --filter note-web-tray run tauri build"
```

### Stap 5 — `package.json` voor `note-web-tray`

```json
{
  "name": "note-web-tray",
  "version": "0.1.0",
  "scripts": {
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2"
  }
}
```

---

## Bestandswijzigingen overzicht

| Bestand | Actie |
|---------|-------|
| `apps/web-app/package.json` | Voeg `@tauri-apps/api` toe als dependency |
| `apps/web-app/src/services/serverApi.ts` | Voeg Tauri IPC fallback toe per functie |
| `apps/note-web-tray/package.json` | Nieuw |
| `apps/note-web-tray/src-tauri/Cargo.toml` | Nieuw |
| `apps/note-web-tray/src-tauri/build.rs` | Nieuw |
| `apps/note-web-tray/src-tauri/tauri.conf.json` | Nieuw |
| `apps/note-web-tray/src-tauri/capabilities/default.json` | Nieuw |
| `apps/note-web-tray/src-tauri/src/main.rs` | Nieuw |
| `apps/note-web-tray/src-tauri/src/lib.rs` | Nieuw |
| `apps/note-web-tray/src-tauri/src/commands.rs` | Nieuw |
| `Cargo.toml` (root) | Voeg `apps/note-web-tray/src-tauri` toe aan workspace |
| `package.json` (root) | Voeg `note-web-tray:dev` en `note-web-tray:build` toe |

---

## Open punten

- Welk tray-icoon gebruiken? Hetzelfde als `note-markdown-client` of een eigen?
- Venster hidden starten of direct tonen bij eerste launch?
- Workspace config locatie: `app_data_dir` (Tauri standaard) of dezelfde CWD als de Vite plugin?
- Lint + type-check pipeline voor de nieuwe Rust code (clippy)?
