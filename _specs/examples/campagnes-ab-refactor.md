# Spec for campagnes ab refactor

branch: feature/instagram-refactor

## summary

Deze feature ondersteunt AB-campagnes met varianten A t/m H, gekoppelde Instagram-accounts en het configureren van meerdere AB-tests per campagne met sample size, primary metric, verdeling, einddatum en statusbeheer. Een winnaar mag pas bepaald worden nadat de ingestelde hybrid-threshold (totaal + minimum per variant) is bereikt.

## Functional Requirements

De functionele requirements voor deze feature staat in: ./documentation/requirements/sales/instagram/instagram-ab-campagnes.md

## Shared Business Rules

Zie: ./documentation/specs/sales/instagram/instagram-shared-business-rules.md

## Possible Edge Cases

- Variantlabel wordt dubbel aangemaakt.
- Label-slot bestaat nog niet en wordt voor het eerst opgeslagen.
- Threshold is nog niet bereikt.
- Einddatum wordt bereikt voordat een winnaar bepaald kan worden.
- Verdeling over varianten is ongeldig of onvolledig.
- Test staat op paused terwijl er nog assignments klaarstaan.

## Acceptance Criteria

AC-AB-01
Gegeven dat de gebruiker zich in de AB-tab bevindt, wanneer een campagne wordt aangemaakt of bewerkt, dan kan daar een Instagram-account gekoppeld worden via account-selector of via “koppel nieuw account”.

AC-AB-02
Gegeven dat een Instagram-account is gekoppeld aan de AB-campagne, wanneer de gebruiker de campagne opent, dan is de accountstatus zichtbaar.

AC-AB-03
Gegeven dat een AB-campagne bestaat, wanneer de gebruiker varianten wil aanmaken, dan kunnen varianten met labels A t/m H worden aangemaakt.

AC-AB-04
Gegeven dat er al een variant met een bepaald label bestaat, wanneer de gebruiker hetzelfde label opnieuw probeert aan te maken binnen dezelfde campagne, dan wordt dit voorkomen.

AC-AB-05
Gegeven dat de gebruiker een AB-test wil aanmaken, wanneer de gebruiker op “AB-test aanmaken” klikt, dan opent een modal met verplicht naamveld.

AC-AB-06
Gegeven dat een AB-test wordt aangemaakt, wanneer de modal valide is ingevuld, dan wordt een nieuwe AB-test voor de geselecteerde campagne aangemaakt.

AC-AB-06b
Gegeven dat meerdere AB-tests bestaan binnen dezelfde campagne, wanneer de gebruiker een test kiest in de AB-test selector, dan wordt die test actief voor configuratie en statusacties.

AC-AB-06c
Gegeven dat geen AB-test is geselecteerd, wanneer de AB-tab wordt getoond, dan wordt de configuratie niet getoond en ziet de gebruiker een selecteer-eerst melding.

AC-AB-07
Gegeven dat de minimale sample size threshold nog niet is bereikt, wanneer de gebruiker de testresultaten bekijkt, dan wordt nog geen winnaar definitief bepaald.

AC-AB-08
Gegeven dat de threshold wel is bereikt, wanneer de winnende variant bepaald wordt, dan gebruikt het systeem de ingestelde primary metric.

AC-AB-09
Gegeven dat de gebruiker een primary metric kiest, wanneer de test wordt opgeslagen, dan is alleen een van de volgende waarden toegestaan:

- geopend
- geclicked
- geconverteerd

AC-AB-10
Gegeven dat de gebruiker een verdeling over varianten configureert, wanneer de test wordt opgeslagen, dan wordt die verdeling bewaard voor gebruik bij assignments.

AC-AB-11
Gegeven dat de AB-test een einddatum heeft, wanneer deze datum is bereikt, dan voldoet de test aan het stopcriterium einddatum.

AC-AB-12
Gegeven dat de AB-test is aangemaakt, wanneer de status wordt getoond, dan is de status altijd één van:

- draft
- running
- paused
- completed

AC-AB-13
Gegeven dat een test net is aangemaakt en nog niet gestart is, wanneer de status wordt opgevraagd, dan is de status draft.

AC-AB-14
Gegeven dat een test actief berichten toewijst of uitvoert, wanneer de status wordt opgevraagd, dan is de status running.

AC-AB-15
Gegeven dat een test handmatig is gepauzeerd, wanneer de status wordt opgevraagd, dan is de status paused.

AC-AB-16
Gegeven dat een test is beëindigd door einddatum of voltooiing, wanneer de status wordt opgevraagd, dan is de status completed.

AC-AB-17
Gegeven dat een verdeling altijd uit moet komen op 100%

AC-AB-18
Gegeven dat als de einddatum is bereikt zonder winnaar er ook geen winnaar gekozen kan worden voor een eventuele modus die dit verlangt

AC-AB-19
Gegeven dat de campagnes van de AB testing opgeslagen in de instagramCampaignsAB op basis van hetzelfde schema van instagramCampaigns met de aanvullingen die nodig zijn

AC-AB-20
Gegeven dat alle invoervelden zijn voorzien van een label voor verduidelijking

AC-AB-21
Gegeven dat voor het bericht een textarea wordt gebruikt

AC-AB-22
meer spacing tussen de variantlabel en variantbericht en de variant button rechts onderin het component

AC-AB-23
Gegeven dat varianten label-slots A t/m H zijn, wanneer de gebruiker een label kiest, dan wordt direct de bijbehorende variantinhoud geladen in de textarea.

AC-AB-24
Gegeven dat de gebruiker een variantbericht aanpast, wanneer op “Variant opslaan” wordt geklikt, dan wordt de variant voor dat label-slot aangemaakt of bijgewerkt.

AC-AB-25
Gegeven dat variantbewerking slot-gebaseerd is, wanneer de AB-tab wordt getoond, dan is er geen aparte lijst met “A: bericht + verwijder” en geen losse “Variant toevoegen” actie.

AC-AB-26
Gegeven dat de gebruiker de threshold wil begrijpen, wanneer de gebruiker op het info-icoon bij “Totale threshold” klikt, dan wordt in een popover uitgelegd dat deze threshold geldt voor de geselecteerde AB-test.

AC-AB-27
Gegeven dat threshold-uitleg wordt getoond, wanneer de gebruiker de popover leest, dan wordt exposure expliciet gedefinieerd als het aantal berichten met status `sent` binnen de geselecteerde AB-test.

AC-AB-28
Gegeven dat de gebruiker de threshold-uitleg bekijkt, wanneer de popover wordt getoond, dan bevat deze een concreet voorbeeld (sample size per variant + totale threshold) zodat duidelijk is wanneer een winnaar wel of niet bepaald wordt.

## Open Questions

- Geen open vragen op dit moment; threshold en statustransities zijn functioneel vastgelegd.

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create menaingful tests for the following cases, without going too heavy:

- Test aanmaken van varianten A t/m H.
- Test blokkade op dubbele variantlabels.
- Test opslaan van AB-test met sample size en geldige primary metric.
- Test dat geen winnaar wordt bepaald vóór threshold.
- Test statusovergangen en stop op einddatum.
- Deze invulling volgt uit de bestaande AB-criteria voor varianten, sample size, threshold, primary metric, verdeling, stopcriterium en statuses.
