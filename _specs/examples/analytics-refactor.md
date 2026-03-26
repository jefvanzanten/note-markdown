# Spec for analytics refactor

branch: feature/instagram-refactor

## summary

Deze feature toont analytics voor actieve Instagram AB-tests op variantniveau. Per variant worden minimaal geopend, geclicked en geconverteerd getoond. Het systeem bepaalt live welke variant voorligt op basis van de prioriteit conversie > geclicked > geopend. Exposure telt alleen mee zodra een bericht de status sent heeft bereikt.

## Functional Requirements

De functionele requirements voor deze feature staat in: ./documentation/requirements/sales/instagram/instagram-analytics.md

## Shared Business Rules

Zie: ./documentation/specs/sales/instagram/instagram-shared-business-rules.md

## Possible Edge Cases

- Variants hebben nog geen exposure of nog geen events.
- Twee varianten hebben gelijke conversie en gelijke clicks.
- Er komen late events binnen nadat de pagina al geladen is.
- Een variant heeft wel opens maar nog geen clicks of conversies.
- Een gebruiker is nog niet sent maar heeft wel een event in de trackingbron.

## Acceptance Criteria

Analytics — AB test statistieken

AC-AN-01
Gegeven dat er een actieve AB-test bestaat, wanneer een gebruiker de analytics van deze test opent, dan ziet de gebruiker per variant minimaal de metrics:

- geopend
- geclicked
- geconverteerd

AC-AN-02
Gegeven dat een AB-test meerdere varianten heeft, wanneer de analytics worden geladen, dan worden de statistieken per variant afzonderlijk weergegeven.

AC-AN-03
Gegeven dat er nieuwe events binnenkomen voor een lopende AB-test, wanneer de analytics opnieuw worden geladen of live worden ververst, dan tonen de statistieken de actuele stand.

AC-AN-04
Gegeven dat twee varianten met elkaar worden vergeleken, wanneer een winnaar wordt bepaald, dan gebeurt dit op basis van de prioriteit:

- conversie
- geclicked
- geopend

AC-AN-05
Gegeven dat variant A een hogere conversie heeft dan variant B, wanneer de winnaar wordt bepaald, dan wordt variant A als winnaar getoond, ongeacht click- of open-rate.

AC-AN-06
Gegeven dat de conversie van varianten gelijk is, wanneer de winnaar wordt bepaald, dan wordt gekeken naar geclicked als volgende beslisregel.

AC-AN-07
Gegeven dat conversie en clicks gelijk zijn, wanneer de winnaar wordt bepaald, dan wordt gekeken naar geopend als laatste beslisregel.

AC-AN-08
Gegeven dat een user een berichtstatus sent heeft bereikt, wanneer exposure wordt berekend, dan telt deze user mee in de exposure.

AC-AN-09
Gegeven dat een user nog niet de status sent heeft bereikt, wanneer exposure wordt berekend, dan telt deze user niet mee in de exposure.

AC-AN-10
Gegeven dat er nog geen winnende variant eenduidig kan worden vastgesteld, wanneer de analytics worden getoond, dan wordt geen onterechte winnaar weergegeven.

## Open Questions

- Wat gebeurt er bij een volledige tie op conversie, clicks én opens?
- Geldt winnaar-bepaling alleen voor A/B of ook voor meer dan twee varianten?
- Worden metrics als absolute aantallen, ratios of allebei getoond?
- Hoe “live” is live: polling, manual refresh of realtime push?

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create menaingful tests for the following cases, without going too heavy:

- Test dat per variant geopend, geclicked en geconverteerd zichtbaar zijn.
- Test dat exposure alleen users met status sent meetelt.
- Test winner-bepaling bij verschil in conversie.
- Test tie-break op clicks en daarna opens.
- Test dat zonder eenduidige winnaar geen winnaar wordt getoond.
- Dit sluit direct aan op de huidige analytics-criteria en de bronrequirement voor live winner-bepaling en exposure op sent.
