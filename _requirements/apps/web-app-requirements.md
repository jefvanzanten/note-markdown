# Functional Requirements

## Tray applicatie
- De applicatie start als tray app (`note-web-tray`)
- De applicatie is een standalone binary en hoeft niet met pnpm of Node.js te worden gestart
- De tray app is een Tauri 2 applicatie zonder venster die een embedded Axum HTTP server opstart op `localhost:1422`
- De embedded server serveert de web-app (statische bestanden) én de REST API (`/api/*`)
- De statische bestanden van de web-app zijn op compile-tijd ingebakken in de binary via `rust-embed`
- Links klikken op het tray-icoon opent `http://localhost:1422` in de standaardbrowser
- Het tray-menu biedt "Open in browser" en "Quit"
- De workspace-configuratie wordt opgeslagen in de app data directory van het besturingssysteem

## Workspaces
- Het systeem laadt de laatst geladen workspace by default
- Het systeem gebruikt een folder als workspace en deze kan een naam worden gegeven naar keuze
- Het systeem biedt de eerste keer opstarten aan om te bladeren naar een workspace naar keuze
- Het systeem toont recent geopende workspaces onderaan het workspace-keuzeformulier
- Het systeem slaat de workspace op zodat na een herstart automatisch dezelfde workspace wordt geladen

## Browser ondersteuning
- Het systeem werkt in elke moderne browser (ook Brave, Firefox)
- In server-modus leest en schrijft de applicatie bestanden via een lokale REST API op `localhost:1422`; in development via de Vite middleware (`fileSystemPlugin`), in productie via de embedded Axum server in de tray app
- In FSA-modus (Chrome/Edge) gebruikt het systeem de Web File System Access API
- In fallback-modus (overige browsers zonder FSA) worden bestanden gelezen via een `<input webkitdirectory>`; wijzigingen worden opgeslagen als download

## Mapbrowser
- Het systeem biedt een in-app mapbrowser aan in dark-mode stijl
- De mapbrowser laat toe om door submappen te navigeren en een map te selecteren als workspace

## Markdown Editor
- Hergebruik de bestaande Markdown Editor in de packages folder

## Titelbalk
- De header is opgedeeld in twee delen:
    - De bestandenlijst
    - De tabbar
- De bestandenlijst kan met het icoon daarboven worden ingeklapt
- De tabbar laat de geopende bestanden zien als tabblad
- De markdown editor wordt onder de tabbar weergegeven en schaalt mee als de bestandenlijst wordt ingeklapt

## Bestandenlijst
- De bestandenlijst toont bestanden en mappen in een boomstructuur
- Mappen kunnen worden ingeklapt en uitgevouwen
- De inklap-status van mappen blijft bewaard na het herladen van de pagina
- Bestanden in een map worden ingesprongen weergegeven
- Geopende (dirty) bestanden krijgen een indicatie (•) in de bestandenlijst en in de tabbar
- Het laatst geopende tabblad wordt na een herstart automatisch hersteld

## Workspace-voettekst
- Onderaan de bestandenlijst wordt de naam van de huidige workspace getoond
- Als er geen naam is ingesteld, wordt "workspace1" als standaardnaam getoond
- Er is een knop om een nieuwe workspace te openen
- De voettekst klapt mee in wanneer de bestandenlijst wordt ingeklapt

## Opslaan
- Ctrl+S slaat het actieve bestand op
- In server-modus en FSA-modus wordt direct naar schijf geschreven
- In fallback-modus wordt een download-dialoog geopend
