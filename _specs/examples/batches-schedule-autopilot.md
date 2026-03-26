# Spec for [feature-name]

branch: claude/feature/[feature-name]

## summary

Deze feature ondersteunt batchmatige DM-verzending, schedule-based assignments en autopilot-verwerking. De scope omvat per-bericht tracking, batchmodi, filtering op DM_SEND, statusflows voor batch en schedule, retry policy, en autopilot-regels zoals trafficverdeling, cooldown en ratelimits.
Deze feature is expliciet een DM-domein en staat los van follow-/volg-acties.
UI-locatie: aparte tab "DM batches" binnen `sales/instagram` (tussen followers en accounts).

## Functional Requirements

De functionele requirements voor deze feature staan in: ./documentation/requirements/sales/instagram/instagram-followers.md en ./documentation/requirements/sales/instagram/instagram-batch-autopilot.md
Gebruik followers/following alleen als mogelijke selectiesource voor DM-batches, niet voor follow-campagne-executie.

## Shared Business Rules

Zie: ./documentation/specs/sales/instagram/instagram-shared-business-rules.md

## Possible Edge Cases

- User heeft DM_SEND = true.
- Batch overschrijdt limiet van 100 berichten.
- Handmatige DM bestaat al voor batch-user.
- User is al gekoppeld aan dezelfde campaign of hetzelfde experiment.
- Retrylimiet is bereikt.
- Autopilot staat uit terwijl er nieuwe users binnenkomen.
- Daglimiet of userlimiet is bereikt.

## Acceptance Criteria

AC-BM-01
Gegeven dat een bericht is verstuurd of verwerkt binnen een batch, wanneer de berichtdetails worden bekeken, dan is per bericht de status inzichtelijk voor:

geopend
geclicked
geconverteerd

AC-BM-02
Gegeven dat een event plaatsvindt op berichtniveau, wanneer de status wordt bijgewerkt, dan is die update terug te zien bij het juiste bericht.

AC-BM-03
Gegeven dat tracking nodig is, wanneer een bericht of variantbericht wordt gegenereerd, dan ondersteunt het systeem een unieke URL-structuur zodat events aan het juiste bericht, variantbericht en/of persoon gekoppeld kunnen worden.
Op dit punt is de bron functioneel nog niet scherp genoeg om exact af te dwingen op welk niveau de URL uniek moet zijn; dat staat als open punt onderaan.

AC-BA-01
Gegeven dat de gebruiker een batch aanmaakt, wanneer de batchmodus gekozen wordt, dan is alleen een van deze modi toegestaan:

AB Campagne
Campagne
AB Campagne + Beste bericht

AC-BA-02
Gegeven dat een batch users selecteert voor verzending, wanneer de batch wordt uitgevoerd, dan worden alleen users meegenomen waarvoor DM_SEND = false.

AC-BA-03
Gegeven dat een user DM_SEND = true heeft, wanneer de batch wordt samengesteld of uitgevoerd, dan wordt deze user niet opnieuw ingepland voor verzending.

AC-BA-04
Gegeven dat een batch wordt aangemaakt of uitgebreid, wanneer het totaal aantal berichten boven 100 uitkomt, dan wordt dit geblokkeerd.

AC-BA-05
Gegeven dat een batch verzonden wordt, wanneer het systeem de verzendsnelheid bepaalt, dan gebeurt verzending volgens een lage rating die Instagram-limieten respecteert.

AC-BA-06
Gegeven dat een batch in AB-campagnemodus draait, wanneer een user wordt ingepland, dan wordt in de schedule table minimaal vastgelegd:

- user
- verzendaccount
- tijdstip
- koppeling met AB-testcontext

AC-BA-07
Gegeven dat een user al is gekoppeld aan dezelfde campaign of hetzelfde experiment, wanneer opnieuw een assignment wordt gemaakt, dan wordt dit geblokkeerd op basis van de constraint “1 user per campaign of experiment”.

AC-BA-08
Gegeven dat een handmatige DM al heeft plaatsgevonden voor een batch-user, wanneer die user binnen de batch wordt geëvalueerd, dan krijgt die batch-user de status skipped_manual.

AC-BA-09
Gegeven dat een batch wordt opgeslagen, wanneer de batchstatus wordt getoond, dan is de status altijd één van:

- draft
- scheduled
- running
- completed
- canceled

AC-BA-10
Gegeven dat een batch is aangemaakt maar nog niet gepland of gestart, wanneer de status wordt opgevraagd, dan is de status draft.

AC-BA-11
Gegeven dat een batch gepland is voor toekomstige verzending, wanneer de status wordt opgevraagd, dan is de status scheduled.

AC-BA-12
Gegeven dat een batch actief berichten verstuurt, wanneer de status wordt opgevraagd, dan is de status running.

AC-BA-13
Gegeven dat alle batchitems zijn afgehandeld, wanneer de status wordt opgevraagd, dan is de status completed.

AC-BA-14
Gegeven dat een batch handmatig of functioneel is gestopt, wanneer de status wordt opgevraagd, dan is de status canceled.

AC-SC-01
Gegeven dat een assignment voor verzending wordt aangemaakt, wanneer het record wordt opgeslagen, dan bevat het schedule record minimaal:

- user_id
- experiment_id
- variant
- assignment layer
- assignment_type

AC-SC-02
Gegeven dat een assignment_type wordt vastgelegd, wanneer het record wordt opgeslagen, dan is alleen toegestaan:

experiment
winner_rollout

AC-SC-03
Gegeven dat een variant wordt vastgelegd voor een schedule record, wanneer het record wordt opgeslagen, dan kan deze een waarde hebben zoals A/B/C/… passend bij de campagneconfiguratie.

AC-SC-04
Gegeven dat een schedule record bestaat, wanneer de status wordt getoond, dan is deze altijd één van:

- pending
- sending
- sent
- failed
- retrying

AC-SC-05
Gegeven dat een record ingepland maar nog niet verwerkt is, wanneer de status wordt opgevraagd, dan is de status pending.

AC-SC-06
Gegeven dat een bericht op dat moment actief verzonden wordt, wanneer de status wordt opgevraagd, dan is de status sending.

AC-SC-07
Gegeven dat verzending succesvol is afgerond, wanneer de status wordt opgevraagd, dan is de status sent.

AC-SC-08
Gegeven dat verzending is mislukt en geen directe succesvolle afronding heeft, wanneer de status wordt opgevraagd, dan is de status failed.

AC-SC-09
Gegeven dat een mislukte verzending opnieuw geprobeerd wordt, wanneer de retry-flow actief is, dan is de status retrying.

AC-SC-10
Gegeven dat retry policy is geconfigureerd, wanneer een verzending faalt, dan houdt het systeem rekening met:

max retries
backoff

AC-SC-11
Gegeven dat het maximum aantal retries is bereikt, wanneer een volgende retry overwogen wordt, dan vindt geen extra retry meer plaats.

AC-SC-12
Gegeven dat backoff is geconfigureerd, wanneer een retry wordt ingepland, dan gebeurt dat met oplopende of geconfigureerde wachttijd tussen retries.

AC-AU-01
Gegeven dat autopilot beschikbaar is, wanneer de gebruiker deze functionaliteit gebruikt, dan kan het systeem automatisch nieuwe followers en/of following ophalen.

AC-AU-02
Gegeven dat autopilot is ingeschakeld via de toggle, wanneer nieuwe geschikte users beschikbaar zijn, dan kunnen berichten automatisch worden ingepland of verstuurd volgens de ingestelde regels.

AC-AU-03
Gegeven dat autopilot is uitgeschakeld, wanneer nieuwe users beschikbaar komen, dan worden geen automatische verzendingen gestart.

AC-AU-04
Gegeven dat een autopilot-item wordt ingepland, wanneer dit record wordt opgeslagen, dan bevat de planningsstructuur minimaal:

- id
- user
- bericht
- tijd
- status

AC-AU-05
Gegeven dat een autopilot-assignment wordt gemaakt, wanneer assignment_type wordt opgeslagen, dan is alleen toegestaan:

- experiment
- winner_rollout

AC-AU-06
Gegeven dat de gebruiker de bron voor autopilot instelt, wanneer de configuratie wordt opgeslagen, dan kan de bron zijn:

- nieuwe volgers
- bestaande selectie

AC-AU-07
Gegeven dat verkeer verdeeld moet worden tussen AB-test en beste bericht, wanneer traffic verdeling is ingesteld op 50/50, dan wordt de ingestelde verdeling gebruikt bij nieuwe assignments.

AC-AU-08
Gegeven dat cooldown is geconfigureerd, wanneer een user opnieuw in aanmerking komt voor verzending, dan voorkomt het systeem verzending binnen de cooldown-periode.

AC-AU-09
Gegeven dat ratelimits zijn geconfigureerd, wanneer het systeem automatische verzending plant, dan respecteert het systeem:

- max per day (hard cap)
- max per user

AC-AU-10
Gegeven dat het maximum per dag is bereikt, wanneer extra verzendingen gepland zouden worden, dan worden deze niet meer dezelfde dag ingepland of verstuurd.

AC-AU-11
Gegeven dat het maximum per user is bereikt, wanneer dezelfde user opnieuw geselecteerd wordt, dan wordt geen extra verzending voor die user aangemaakt.

AC-AU-12
Gegeven dat scheduling voor autopilot is geconfigureerd, wanneer nieuwe assignments ontstaan, dan worden deze volgens die schedule verwerkt.

## Open Questions

- Wat is precies de unieke URL-sleutel: per bericht, per variantbericht, per persoon of een combinatie?
- Wat zijn de exacte throttle- of send-limits voor “lage rating versturen”?
- Geldt de limiet van 100 per batch, per run of per account?
- Hoe wordt assignment layer functioneel ingevuld?
- Wat is het scheduleformaat voor autopilot?
- Wat gebeurt er met reeds geplande items wanneer autopilot wordt uitgezet?

## Testing Guidelines

Create a test file(s) in the ./tests folder for the new feature, and create menaingful tests for the following cases, without going too heavy:

- Test filtering op DM_SEND = false.
- Test blokkade bij meer dan 100 berichten.
- Test skipped_manual voor users met handmatige DM.
- Test constraint “1 user per campaign of experiment”.
- Test batchstatusovergangen.
- Test schedule retry en backoff.
- Test autopilot toggle, cooldown en ratelimits.
- Deze invulling is direct af te leiden uit de bronnotities en de AC’s voor batch, schedule en autopilot.
