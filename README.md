# note-markdown monorepo

Workspace met twee Tauri apps die dezelfde markdown core en frontend bouwblokken delen:

- `note-markdown-client`: tab-gebaseerde markdown app
- `note-markdown-sticky`: sticky notes variant met `+`, save en `x` per sticky-window

## Structuur

- `shared/note-core`: gedeelde Rust domein/service/filesystem logica
- `shared/note-shared-*`: gedeelde frontend types/api/store/editor

## Installeren

```bash
pnpm install
```

## Snelle worktree setup (pnpm)

```bash
pnpm run install:fast
```

## Ontwikkelen

```bash
# tauri apps
pnpm run note-client:dev
pnpm run note-sticky:dev
```

## Checks

```bash
pnpm run check
pnpm run build
cargo test -p note-core
```
