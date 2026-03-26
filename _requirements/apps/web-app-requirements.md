# Functional Requirements

## Tray applicatie
- De applicatie start als tray app
- De applicatie is een runnable en hoeft niet met npm gestart te worden

## Workspaces
- Het systeem laadt de laatst geladen workspace by default
- Het systeem gebruikt een folder als workspace en deze kan een naam worden gegeven naar keuze
- Het systeem biedt de eerste keer opstarten aan om te bladeren naar een workspace naar keuze
- Het systeem toont recent geopende workspaces onderaan het workspace-keuzeformulier
- Het systeem slaat de workspace op zodat na een herstart automatisch dezelfde workspace wordt geladen

## Browser ondersteuning
- Het systeem werkt in elke moderne browser (ook Brave, Firefox)
- In server-modus leest en schrijft de applicatie bestanden via een lokale Vite-API (Node.js bestandstoegang)
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
