# Monorepo Guide

## Layout

- `note-markdown-client`: tab-based markdown app
- `note-markdown-sticky`: sticky note app
- `shared/note-shared-types`: shared frontend DTO types
- `shared/note-shared-api`: shared Tauri API wrappers
- `shared/note-shared-state`: shared Svelte stores
- `shared/note-shared-editor`: shared markdown editor component
- `shared/note-core`: shared Rust domain/service/infra core

## Install

```bash
npm install
```

## Frontend Dev

```bash
npm run dev:note-markdown-client
npm run dev:note-markdown-sticky
```

## Tauri Dev

```bash
npm run tauri:note-markdown-client -- dev
npm run tauri:note-markdown-sticky -- dev
```

## Checks

```bash
npm run check
npm run build
cargo test -p note-core
cargo check -p note-markdown -p note-markdown-sticky
```

## Sticky controls

In `note-markdown-sticky/src/App.svelte`, each sticky window has:

- `+`: create a new sticky window
- `Save`: save current sticky
- `x`: close current sticky window

When a sticky is dirty/unsaved, closing shows a confirm first.
