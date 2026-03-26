# Spec for campagnes refactor

branch: feature/instagram-refactor

## summary

Deze feature ondersteunt het aanmaken van Instagram-campagnes, het koppelen van een Instagram-account aan een campagne, het tonen van de accountstatus en het koppelen van één of meerdere berichten aan de campagne. Verzending mag niet gestart worden als een vereist Instagram-account ontbreekt.

## Functional Requirements

De functionele requirements voor deze feature staat in: ./documentation/requirements/sales/instagram/instagram-campagnes.md

## Shared Business Rules

Zie: ./documentation/specs/sales/instagram/instagram-shared-business-rules.md

## Possible Edge Cases

- Campagne wordt opgeslagen zonder gekoppeld Instagram-account.
- Account is gekoppeld maar heeft een foutstatus of is niet meer bruikbaar.
- Campagne heeft nog geen berichten.
- Gebruiker probeert verzending te starten zonder gekoppeld account.
- Bestaand gekoppeld account wordt tussentijds vervangen.

## Acceptance Criteria

AC-CA-01
Gegeven dat de gebruiker een campagne wil aanmaken, wanneer alle verplichte velden zijn ingevuld, dan kan de campagne succesvol worden opgeslagen.

AC-CA-02
Gegeven dat een campagne bestaat, wanneer de gebruiker een Instagram-account wil koppelen, dan kan de gebruiker een bestaand account selecteren via een account-selector.

AC-CA-03
Gegeven dat het gewenste Instagram-account nog niet bestaat, wanneer de gebruiker kiest voor “koppel nieuw account”, dan kan een nieuw account gekoppeld worden aan de campagne.

AC-CA-04
Gegeven dat een campagne aan een Instagram-account gekoppeld is, wanneer de campagne wordt geopend, dan is de gekoppelde account zichtbaar.

AC-CA-05
Gegeven dat een Instagram-account een bekende status heeft, wanneer de campagne wordt geopend, dan wordt de accountstatus zichtbaar getoond.

AC-CA-06
Gegeven dat een campagne bestaat, wanneer de gebruiker een bericht toevoegt, dan kan deze aan de campagne worden gekoppeld.

AC-CA-07
Gegeven dat een bericht aan een campagne is gekoppeld, wanneer de campagne wordt geopend, dan is het bericht zichtbaar binnen die campagne.

AC-CA-08
Gegeven dat geen Instagram-account is gekoppeld terwijl dit vereist is voor verzending, wanneer de gebruiker de campagne probeert te activeren voor verzending, dan wordt dit geblokkeerd met een duidelijke validatie.

AC-CA-09
Gegeven dat een instagram account verplicht is voor verzenden en niet voor opslaan.

AC-CA-10
Gegeven dat een campagne altijd één actief account heeft, maar deze wel gewisseld kan worden.

## Open Questions

- Welke accountstatussen moeten exact ondersteund worden?

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create menaingful tests for the following cases, without going too heavy:

- Test campagne aanmaken met verplichte velden.
- Test koppelen van bestaand account via toggle.
- Test koppelen van nieuw account.
- Test tonen van gekoppeld account en accountstatus.
- Test blokkade bij verzendactie zonder verplicht account.
- Dat volgt uit de huidige campagne-AC’s rond accountkoppeling, zichtbare status, berichten koppelen en verzendvalidatie.
