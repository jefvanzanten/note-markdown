# TODOS

# Done

## Bootstrap

- [x] Initialize Svelte + Vite frontend structure
- [x] Initialize Tauri + Rust backend structure
- [x] Add CodeMirror markdown editor integration

## Core Services

- [x] Implement tab domain model + DTOs
- [x] Implement `new_note` temp tab behavior (`tmp-N`)
- [x] Implement open/save/save-as flow
- [x] Implement autosave for unsaved temp notes
- [x] Implement temp cleanup after successful Save As
- [x] Implement session persist + restore

## Tauri Commands

- [x] Expose required command contract
- [x] Hook shutdown persistence on window close

## UI Integration

- [x] Toolbar actions (Nieuw/Openen/Opslaan/Opslaan als/Sluit tab)
- [x] Tab strip with active state + dirty marker
- [x] Editor-to-command content synchronization
- [x] Session default save-directory suggestion behavior

## Tests

- [x] Unit: unique tmp naming
- [x] Unit: autosave temp persistence
- [x] Unit: save-as updates tab + cleans temp
- [x] Unit: session restore order
- [ ] Integration: Tauri command-level end-to-end flows
- [ ] E2E: UI scenarios on packaged app

## Docs

- [x] README with setup, run, and feature summary
- [x] DESIGN_DOC with architecture/data flow/contracts
- [x] Document sticky app behavior in DESIGN_DOC/TODOS
- [x] Keep TODO status updated

## Sticky UI changes

- [x] Kleur instelbaar met de settings knop (gear icon)
- [x] Kleur instellen met een color picker
- [x] opacity ook aanpasbaar in de settings
- [x] icons in de topbar zij niet met elke kleur te zien. geen witte bg maar echt alleen de icon met een transparante bg. pas de kleur aan om een contrast te zijn van de gekozen kleur

## Sticky gedrag

- [x] Elke sticky krijgt een eigen always-on-top window
- [x] Sessie restore opent opnieuw alle eerder geopende sticky windows
- [x] Sluiten van een dirty sticky vraagt bevestiging (behalve lege/herstel-temp sticky)
- [x] Sticky stijl (kleur + opacity) wordt per sticky opgeslagen in localStorage
- [x] Sticky window grootte wordt bewaard en hersteld bij de volgende start
- [x] Sneltoetsen: `Ctrl/Cmd+N`, `Ctrl/Cmd+S`, `Ctrl/Cmd+Shift+S`, `Ctrl/Cmd+Shift+C`, `Ctrl/Cmd+W`
