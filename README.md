# note-markdown monorepo

Workspace met twee Tauri apps die dezelfde markdown core en frontend bouwblokken delen:

- `note-markdown-client`: tab-gebaseerde markdown app
- `note-markdown-sticky`: sticky notes variant met `+`, save en `x` per sticky-window

## Structuur

- `shared/note-core`: gedeelde Rust domein/service/filesystem logica
- `shared/note-shared-*`: gedeelde frontend types/api/store/editor

## Installeren

```bash
npm install
```

## Ontwikkelen

```bash
# frontend dev servers
npm run dev:note-markdown-client
npm run dev:note-markdown-sticky

# tauri apps
npm run tauri:note-markdown-client -- dev
npm run tauri:note-markdown-sticky -- dev
```

## Checks

```bash
npm run check
npm run build
cargo test -p note-core
```
