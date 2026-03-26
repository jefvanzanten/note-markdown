# Spec for [feature-name]

branch: claude/feature/[feature-name]
figma_component (if used): [figma-component-name]

## summary

Deze feature maakt het mogelijk om accounts vanuit de Followers- en Following-tab te selecteren en toe te voegen aan een DM-batch.
De status/badge-indicatie van batches wordt alleen op de DM-batches tab getoond, niet op Followers/Following.
Selectiegedrag is local-session (niet persistent na refresh).

## Functional Requirements

De functionele requirements voor deze feature staat in: ./documentation/requirements/sales/instagram/instagram-followers.md en ./documentation/requirements/sales/instagram/instagram-following.md

## Shared Business Rules

Zie: ./documentation/specs/sales/instagram/instagram-shared-business-rules.md

## Possible Edge Cases

- Gebruiker voegt dezelfde account meerdere keren toe.
- Er is geen selectie gemaakt.
- Selectie komt uit zowel Followers als Following.
- De tab wordt opnieuw geladen nadat al accounts aan een batch zijn toegevoegd.

## Acceptance Criteria

AC-FF-01
Gegeven dat de gebruiker zich op de Followers- of Following-tab bevindt, wanneer de gebruiker één of meer accounts selecteert, dan kunnen deze accounts worden toegevoegd aan een batch.

AC-FF-02
Gegeven dat één of meer accounts zijn geselecteerd voor een batch, wanneer de selectie is toegevoegd, dan kan de gebruiker via een actie naar de DM-batches tab om de batchcreatie af te ronden.

AC-FF-03
Gegeven dat batchstatus of batchaantallen zichtbaar moeten zijn, wanneer de gebruiker status bekijkt, dan gebeurt dit op de DM-batches tab.

AC-FF-04
Gegeven dat een account al aan de batch is toegevoegd, wanneer de gebruiker deze opnieuw toevoegt, dan wordt duplicatie voorkomen.

## Open Questions

- Kan een account vanuit Followers/Following nog uit de lokale selectie verwijderd worden voor submit?
- Is een mixed selectie (Followers + Following) één gecombineerde create-flow of twee losse acties?

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create menaingful tests for the following cases, without going too heavy:

- Test toevoegen van één account aan een batch.
- Test toevoegen van meerdere accounts aan een batch.
- Test dat de actie naar DM-batches tab werkt met geselecteerde accounts.
- Test dat dubbelen niet opnieuw worden toegevoegd.
- Test local-session gedrag (refresh reset).
- Dat is in lijn met de huidige focus van dit bestand: selectie, batchindicatie en duplicate prevention.
