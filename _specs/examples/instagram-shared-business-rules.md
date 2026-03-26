# Instagram Shared Business Rules

## summary

Overkoepelende business rules en acceptatiecriteria die gelden voor meerdere Instagram sales features.

## Acceptance Criteria

AC-OV-01
Een user mag binnen dezelfde campaign of hetzelfde experiment maar één actieve koppeling/assignment hebben.

AC-OV-02
Statuswaarden mogen alleen binnen de gedefinieerde set vallen voor:

AB-test
batch
schedule item

AC-OV-03
Winner-bepaling voor analytics en winner-rollout mag pas plaatsvinden als de ingestelde threshold/minimale sample size is gehaald.

AC-OV-04
Exposure wordt consequent berekend op basis van sent en niet op basis van open, click of conversie.

AC-OV-05
Users met handmatige DM mogen niet alsnog als normale batch-verzending worden verwerkt, maar krijgen status skipped_manual.

AC-OV-06
Automatische en handmatige flows moeten dezelfde constraints respecteren voor user/campaign/experiment-combinaties.

## Referenced By

- analytics-refactor-1.md
- campagnes-refactor.md
- campagnes-ab-refactor.md
- following-and-follower-refactor.md
- batches-schedule-autopilot.md
