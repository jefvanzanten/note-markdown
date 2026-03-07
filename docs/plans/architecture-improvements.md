# Architectuur-verbeterplan: note-markdown

## Huidige architectuur

### Structuur

```
note-markdown/
├── note-markdown-client/          [Tauri app: tab-gebaseerde editor]
│   ├── src/App.svelte             [293 regels, enige component]
│   └── src-tauri/src/commands/   [117 regels, DUPLICAAT van sticky]
├── note-markdown-sticky/          [Tauri app: sticky notes]
│   ├── src/App.svelte             [744 regels, mega-component]
│   └── src-tauri/src/commands/   [117 regels, DUPLICAAT van client]
└── shared/
    ├── note-core/                 [Rust: domein + service + infra]
    ├── note-shared-types/         [TS: TabDto, SaveResultDto, Ack]
    ├── note-shared-api/           [TS: Tauri invoke wrappers]
    ├── note-shared-state/         [TS: Svelte stores — alleen client gebruikt dit]
    └── note-shared-editor/        [Svelte: CodeMirror editor]
```

### Data flow

```
UI event → shared-api invoke() → Tauri IPC → AppService (Mutex<>) → note-core
         ← TabDto ←────────────────────────────────────────────────────────────
```

### Persistence

| Wat | Waar |
|-----|------|
| Sessie metadata | `%TEMP%/note-markdown/session.json` |
| Tijdelijke notes | `%TEMP%/note-markdown/tmp-N.md` (autosave 700ms debounce) |
| Sticky stijlen | `localStorage` key `note-markdown-sticky-style-v1` |

### Tauri commands (identiek in beide apps)

| Command | Input | Output |
|---------|-------|--------|
| `list_restore_session` | — | `Vec<TabDto>` |
| `new_note` | — | `TabDto` |
| `open_file` | `path?` | `TabDto` |
| `update_tab_content` | `tabId, content, cursor` | `Ack` |
| `save_tab` | `tabId` | `SaveResultDto` |
| `save_tab_as` | `tabId, targetPath` | `SaveResultDto` |
| `close_tab` | `tabId` | `Ack` |
| `persist_session` | — | `Ack` |

---

## Geïdentificeerde problemen

### Rust backend

| ID | Probleem | Ernst |
|----|----------|-------|
| R1 | `commands/mod.rs` is byte-voor-byte identiek in beide apps (117 regels duplicaat) | **Hoog** |
| R2 | Errors teruggegeven als ongetypeerde `String` — frontend kan typen niet onderscheiden | Medium |
| R3 | Sessie opgeslagen in `%TEMP%` — leesbaar voor andere gebruikers op multi-user systemen | Medium |
| R4 | Geen logging/observability in de Rust laag | Laag |
| R5 | Geen session versioning — schema-migratie bij toekomstige wijzigingen onmogelijk | Laag |
| R6 | Geen limiet op aantal tabs of bestandsgrootte | Laag |

### Frontend

| ID | Probleem | Ernst |
|----|----------|-------|
| F1 | `note-markdown-sticky/src/App.svelte` is 744 regels — UI, kleursysteem, persistence en lifecycle door elkaar | **Hoog** |
| F2 | `toDirectory()` en `hydrateSessionDirectory()` gedupliceerd in beide App.svelte bestanden | **Hoog** |
| F3 | Geen foutfeedback aan gebruiker — save-fouten worden stil genegeerd (`.catch(() => null)`) | **Hoog** |
| F4 | `note-shared-state` Svelte stores worden alleen door de client gebruikt, niet door sticky | Medium |
| F5 | Padnormalisatie hardcoded `\\` — werkt alleen op Windows | Medium |
| F6 | Geen debounce op `updateTabContent` — elke toetsaanslag triggert een Tauri IPC-aanroep | Medium |
| F7 | Sticky-stijlen in `localStorage` — verdwijnen bij browser storage clear | Medium |
| F8 | `.storybook/` map bestaat maar is leeg — Storybook niet geconfigureerd terwijl wel geïnstalleerd | Medium |
| F9 | Nederlandse tekst hardcoded door de hele codebase | Laag |
| F10 | Geen gedeelde design tokens / CSS variabelen tussen de twee apps | Laag |

### Dev tooling

| ID | Probleem | Ernst |
|----|----------|-------|
| D1 | App rendert blank in browser (zonder Tauri context) — geen werkende dev-without-Tauri story | **Hoog** |
| D2 | Beide `vite.config.mts` zijn identiek op de poort na — geen gedeelde basisconfiguratie | Laag |
| D3 | Geen frontend unit tests of component tests | Medium |

---

## Verbeterplan

### Fase 1 — Hoge prioriteit

#### R1: Elimineer Rust command-duplicatie

**Probleem:** `note-markdown-client/src-tauri/src/commands/mod.rs` en `note-markdown-sticky/src-tauri/src/commands/mod.rs` zijn identiek. Een bugfix moet op twee plekken worden toegepast.

**Oplossing:**
1. Maak `shared/note-tauri-commands/` als nieuw Cargo workspace member
2. Verplaats de 8 command handlers daarheen
3. Voeg een `run_app(session_name: &str)` entry function toe
4. Beide `lib.rs` worden een dunne wrapper die `run_app` aanroept

**Impact:** Eén plek voor bugfixes, gedeeld gedrag gegarandeerd.

---

#### F1: Splits `note-markdown-sticky/src/App.svelte`

**Probleem:** 744 regels die meerdere verantwoordelijkheden mixen.

**Oplossing:** Splits op in:

| Nieuw bestand | Inhoud | Geschatte grootte |
|---------------|--------|-------------------|
| `src/lib/components/SettingsMenu/SettingsMenu.svelte` | Kleurpicker, opacity slider, presets | ~80 regels |
| `src/lib/utils/colorSystem.ts` | `mixHexColor`, `contrastColorFor`, `toRgba`, etc. | ~90 regels |
| `src/lib/utils/stickyStyle.ts` | localStorage lezen/schrijven, `applyStoredStyle` | ~50 regels |
| `src/App.svelte` | Alleen orchestratie | < 200 regels |

De `src/lib/components/SettingsMenu/` directory bestaat al maar is leeg — dit vult die in.

---

#### F2 + F3: Gedeelde frontend utilities + foutafhandeling

**Probleem:** `toDirectory()` gedupliceerd; save-fouten worden stil genegeerd.

**Oplossing:** Maak `shared/note-shared-utils/` als nieuw npm workspace package:

```
shared/note-shared-utils/
├── package.json           [@note/shared-utils]
└── src/
    ├── pathUtils.ts       # toDirectory(), cross-platform padnormalisatie
    ├── saveUtils.ts       # saveWithFallback() patroon
    └── index.ts
```

Beide App.svelte bestanden importeren uit `@note/shared-utils` in plaats van eigen implementaties.

---

#### D1: Tauri mock voor dev-without-backend

**Probleem:** `getCurrentWindow()` gooit een fout in browser-context → complete blank app in dev zonder Tauri.

**Oplossing:**
1. Maak `src/mocks/tauri.ts` per app met stub-implementaties voor alle gebruikte Tauri APIs
2. In `vite.config.mts`: bij `VITE_TAURI_MOCK=true` aliaseer `@tauri-apps/api/*` naar de mock
3. Storybook en pure `npm run dev` worden hiermee bruikbaar

---

### Fase 2 — Medium prioriteit

#### R2: Getypeerde errors van Rust naar frontend

**Probleem:** Alle Rust-errors worden `String` — frontend kan `TabNotFound` niet onderscheiden van `SaveAsRequired`.

**Oplossing:**
- Maak een `AppError` enum met `#[derive(Serialize)]` in `note-core`
- Commands returnen `Result<T, AppError>` in plaats van `Result<T, String>`
- Frontend kan dan op error-code reageren met specifieke UI

---

#### F6: Debounce `updateTabContent`

**Probleem:** Elke toetsaanslag in de editor triggert een Tauri IPC-aanroep.

**Oplossing:** Voeg 300ms debounce toe in `MarkdownEditor.svelte` of in de `onChange` handler van de apps. Vermindert IPC traffic met ~90% bij normaal typen.

---

#### F4: Consistente state management

**Probleem:** Sticky app beheert zijn eigen `let tab: TabDto | null` lokaal terwijl de client `note-shared-state` stores gebruikt.

**Oplossing:** Extraheer een `useSingleTab()` composable in `note-shared-state` die dezelfde patronen biedt als de huidige sticky-implementatie, maar deelbaar is.

---

#### D3: Basis frontend tests

**Tooling:** Vitest + `@testing-library/svelte`

**Minimale coverage:**
- Unit tests voor `colorSystem.ts` (zuivere functies, makkelijk te testen)
- Unit tests voor `pathUtils.ts` en `saveUtils.ts`
- Smoke test voor `MarkdownEditor.svelte` (rendert zonder crash)

---

### Fase 3 — Laag prioriteit

| ID | Actie |
|----|-------|
| R3 | Verplaats sessie van `%TEMP%` naar `%APPDATA%\Local\note-markdown\` (Windows) / `~/.local/share/note-markdown/` (Unix) |
| R4 | Voeg `tracing` crate toe aan Rust backend voor structured logging |
| R5 | Voeg `version: u32` toe aan `PersistedSession` + migratielogica per versie |
| D2 | Extraheer gedeelde `vite.config.base.mts` voor beide apps |
| F10 | Maak `shared/note-shared-styles/` voor gedeelde CSS custom properties en design tokens |

---

## Samenvatting prioriteiten

```
HOOG (fase 1)
  R1  Rust command-duplicatie elimineren
  F1  Sticky App.svelte splitsen (744 → <200 regels)
  F2  Gedeelde frontend utils (toDirectory, etc.)
  F3  Foutfeedback aan gebruiker
  D1  Tauri mock voor dev-without-backend

MEDIUM (fase 2)
  R2  Getypeerde errors Rust → frontend
  F4  Consistente state management
  F6  Debounce updateTabContent
  D3  Basis frontend tests

LAAG (fase 3)
  R3  Veiligere sessie-opslag
  R4  Rust logging
  R5  Session versioning
  D2  Gedeelde Vite config
  F10 Design tokens
```