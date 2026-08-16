# Videre arbeid med søkeparametre

## Mål

Skill tydeligere mellom:

1. **Hva brukeren vil undersøke** – konkordanser, telling eller trend.
2. **Hvordan materialet velges ut** – balansert sample, statistisk sample eller
   tekst i korpus-/bokrekkefølge.
3. **Hvordan resultatet presenteres** – antall rader, kontekst og sortering.

Studentenes standardvalg bør være enkelt og trygt. Tekniske parametre skal
bare vises når de uttrykker et reelt faglig valg.

## Konkordanser

Standardvisningen bør forsøke å gi et balansert utvalg, slik at for eksempel 20
konkordanser ikke alle kommer fra samme bok. `perBook` er da
implementasjonsdetaljen bak strategien, ikke nødvendigvis et eget hovedvalg.

Det bør også finnes en mer litterær/tekstnær strategi:

- vis treff i korpusrekkefølge
- vis treff i rekkefølge gjennom én valgt bok
- behold stabile tekstposisjoner ved paginering og eksport
- gjør det tydelig når resultatet ikke er et representativt sample

Mulige strateginavn i API og UI:

- `balanced` – spre treff over flere bøker
- `random` – reproduserbart tilfeldig sample
- `corpus-order` – dokument- og tekstrekkefølge i korpuset
- `book-order` – tekstlig rekkefølge i valgt bok

## Telling og statistisk sampling

Telling og trend bruker i dag hele aktive subkorpus. Dersom telling senere skal
kunne baseres på et dokument-sample, må dette aldri skje skjult. Resultatet må
vise:

- at det er samplet eller estimert
- antall samplede dokumenter og størrelsen på populasjonen
- valgt samplingmetode
- eventuelt seed, slik at resultatet kan gjenskapes
- om tallet er observert i samplet eller ekstrapolert til hele subkorpuset

Sampling av dokumenter, balansering av konkordanser og begrensning av viste
rader er tre forskjellige operasjoner og bør modelleres separat.

## Midlertidig markering av søkeord

Konkordansene bruker foreløpig `[søkeord]`. En enkelt klamme kan også finnes i
originalmaterialet og er derfor ikke en entydig kontrakt for nedstrømsapper.

Som midlertidig utvekslingsformat bør backend returnere `[[søkeord]]` i ren
tekst. Dobbel klamme er enklere å bevare i CSV enn HTML og kan senere migreres
maskinelt. Frontend skal ikke doble alle klammer i etterkant, fordi den da også
ville endre klammer som faktisk tilhører kildeteksten.

På sikt bør responsen skille mellom:

- `fragRaw` – originaltekst uten presentasjonsmarkører
- eksplisitt start/slutt eller venstreord, søkeord og høyreord
- `fragHtml` – semantisk markering som
  `<mark data-layer="match">søkeord</mark>`
- et versjonert felt som oppgir hvilket markeringsformat responsen bruker

Overgangen fra enkeltklamme til dobbeltklamme må derfor gjøres i backend, der
det faktiske treffspennet fortsatt er kjent.

## Backend-kontrakt som må avklares

Dette arbeidet krever koordinering med backend-repositoriet:

- hvilke stabile sorteringsnøkler finnes for bok- og korpusrekkefølge?
- skjer balansering før eller etter treffbegrensning?
- kan tilfeldig sampling bruke en eksplisitt seed?
- kan responsen oppgi `isSampled`, `sampleDocuments`,
  `populationDocuments`, `selectionStrategy` og `isEstimate`?
- hvordan skal paginering fungere uten å endre utvalget mellom kall?
- skal samme kontrakt brukes av `near_query`, `near_fragments` og `or_query`?
- hvordan bevares aktive subkorpusfiltre i alle strategier?

Ingen frontendkontroll bør skjules eller omdøpes før backend-semantikken er
bekreftet.

## Foreslått rekkefølge

1. Dokumenter dagens backendsemantikk for `perBook`, `docSamples`,
   `totalLimit`, sortering og telling.
2. Avtal en eksplisitt utvalgs- og samplingkontrakt med backend.
3. Legg til kontraktstester i backend for balansering, seed og sortering.
4. Erstatt tekniske standardfelt i frontend med faglige strategivalg.
5. Behold avanserte råparametre i en egen ekspertseksjon ved behov.
6. Test med både studenter og korpuslingvister før standardene låses.
