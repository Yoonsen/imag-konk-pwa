# Endringslogg

Vesentlige endringer i ImagiNation korpusutforsker dokumenteres her. Prosjektet
følger [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Nytt

- CSV-nedlasting av tellingsresultater (søk, treff og unike dokumenter), også for sammenligninger.
- Tellingsvisning med egne fliser for treff og unike dokumenter, inkludert totalt over sammenligninger der unike dokumenter er union.

## [1.1.0] – 2026-08-22

### Nytt

- Eksplisitte sammenligninger av komplette søk med `{søk 1; søk 2}`.
- Relative, absolutte og kohortbaserte trendvisninger med valgfri glatting.
- Valgfri punktvisning og eksport av trendgrafer som JPG.
- Opplasting av korpusfiler med URN-oppslag mot DHlab.

### Endret

- `[x,y]` beholder konsekvent betydningen samlet OR-union i alle søkemoduser.
- Sammenligningssøk kjøres sekvensielt for å begrense belastningen på backend.

## [1.0.0]

- Første nummererte versjon av den studentrettede korpusappen.
