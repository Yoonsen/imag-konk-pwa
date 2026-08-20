# Backend-handoff: Roaring, chunks og adaptiv sampling

Dette notatet samler ideene som skal vurderes når arbeidet fortsetter i
backend-repositoriet. Det meste beskriver en prototype, ikke en låst kontrakt.
Unntak: `POST /api/corpus/token-stats` under Tokenmengde er en live payload
frontend kan bygge mot.

## Dagens mentale modell

Backend har to Roaring-nivåer:

1. `token -> Roaring(doc_ids)` for dokumentreduksjon.
2. `(token, doc_id) -> Roaring(positions)` for posisjonene i dokumentet.

Nærhet kontrolleres deretter med SIMD. Svært høyfrekvente token bidrar ikke
nødvendigvis til dokumentreduksjon, fordi de antas å finnes i nesten alle
dokumenter. Sampling skjer før SIMD når kandidatmengden er for stor.

Oppgitt observasjon som må måles mer systematisk: SIMD begynner å bli merkbart
tungt rundt 2 000 dokumenter. Interaktiv Konk bruker gjerne rundt 50 samplede
dokumenter for brede søk.

## Foreslått spørringsplan

```text
aktivt subkorpus
  -> Roaring-snitt/union på dokumentnivå
  -> kostnadsestimat og eventuelt sampling
  -> hent eksisterende posisjonsbitmap
  -> utled kandidat-chunks i minnet
  -> last bare kandidat-chunks med halo
  -> SIMD-verifikasjon
  -> deduplisering på global ankerposisjon
```

OR brukes innen en termgruppe og AND/nærhetskrav mellom grupper.

## Chunking uten nytt B-tre

Start uten en persistent `token -> chunk_ids`-indeks. Eksisterende
posisjonsbitmap inneholder allerede informasjonen som trengs:

```text
local_chunk = floor(position / chunk_size)
```

En chunk kan eksempelvis være 1 024 token. Last den med en halo som minst er
lik største støttede nærhetsvindu. Kandidater ved grenser kan utvides til
nabochunk; falske positiver er akseptable fordi SIMD gjør sluttkontrollen,
mens falske negativer ikke er det.

Chunk-ID bør kunne oversettes direkte til data:

```text
chunk_id -> {doc_id, start_pos, file_offset, byte_length}
```

Bruk en tett offset-tabell, mmap-array eller en beregnbar offset dersom
chunkene lagres sammenhengende per dokument. Et globalt primærnøkkeloppslag
kan brukes i en prototype, men det er ikke behov for et B-tre per chunk eller
per tekst.

Overlapp må ikke gi dobbelttelling. Tilordne et verifisert treff til én
eierchunk basert på global ankerposisjon.

## Kostnadsmodell

Dokumentantall alene er ikke nok. Logg minst:

- kandidatdokumenter før og etter Roaring-reduksjon
- samlet tokenmengde i kandidatdokumentene
- posisjonskardinalitet per termgruppe
- kandidat-chunks og andel av alle chunks
- bytes lest/dekomprimert
- SIMD-tid og total responstid

Målet for interaktiv bruk bør uttrykkes som et tidsbudsjett, ikke et fast
dokumentantall. En første hypotese er 300–500 ms for interaktiv Konk.

Chunking gir mer ensartede beregningsenheter, men svært vanlige token kan
finnes i nesten alle chunks og gir da liten ekstra reduksjon.

## Adaptiv sampling

SIMD gir eksakte treff innen samplet; usikkerheten kommer fra utvalget.

En mulig sekvensiell strategi:

1. Lag en deterministisk tilfeldig rekkefølge med eksplisitt seed.
2. Trekk små batcher, for eksempel 25–50 dokumenter eller chunks.
3. Tell og oppdater estimat og usikkerhet.
4. Prioriter strata med størst forventet reduksjon i usikkerhet per kostnad.
5. Stopp ved ønsket presisjon eller tidsbudsjett.

Mulige stoppkriterier:

- minimum antall observerte treff
- relativ standardfeil under en valgt terskel
- konfidensbånd smalere enn en valgt terskel
- minimum antall enheter per år
- maksimalt tids- eller samplebudsjett

For trend bør det minst stratifiseres på år. For aviser kan avis, år/måned og
eventuelt dokumenttype være relevante strata.

## Sampling-enhet og estimand

Valget av sampling-enhet bestemmer hva frekvensen betyr:

- uniforme chunks gir omtrent lik inklusjonssannsynlighet per token
- uniforme dokumenter gir hvert dokument likere påvirkning
- dokumentutvalg fulgt av chunkutvalg er et totrinns cluster-sample

Chunks fra samme dokument er ikke statistisk uavhengige. Usikkerhet bør derfor
beregnes med dokumentet som cluster, for eksempel dokument-bootstrap eller en
tilsvarende vektet estimator.

Trekk alltid samplet før måluttrykket evalueres, eller trekk uniformt fra en
eksakt kandidatbitmap der dokumenter utenfor bitmapet beviselig har null
mulige treff. Samme sample må brukes for alle ord som sammenlignes.

## Frontend som sampling-orkestrator

For ImagiNation kan frontend prototype stratifisert sampling:

1. grupper metadata etter år
2. trekk reproduserbare dokument-ID-er
3. send ID-ene som eksisterende `filterIds`
4. la backend telle eksakt innen samplet
5. beregn og vis estimat og konfidensbånd

Dette krever lite backendarbeid. Ved korpus med millioner av dokumenter bør
samme kontrakt kunne flyttes til backend uten å endre statistisk semantikk.

Et samplemanifest bør inneholde ID-er, seed, strategi, strata og
inklusjonssannsynligheter.

## Tokenmengde og trendmoduser

Eksakt tokenmengde per dokument kommer fra sidecar `token_blocks`
(`SUM(block_len)`), ikke fra `corpus` i `imagination.db`. Backend materialiserer
`(dhlabid, n_tokens, year)` én gang og summerer per år for aktivt subkorpus.

Planlagte trendvisninger:

- **Absolutt:** rå treff per år.
- **Relativ:** treff delt på tokenmengde samme år.
- **Kohort:** hvert sammenlignet uttrykk delt på summen av alle uttrykkene
  samme år.

År med kohortsum null skal være manglende data, ikke null prosent.

Proxyen med høyfrekvente referansetoken (se `RELATIVE_FREQUENCY_PROXY.md`) kan
beholdes som kontroll/fallback. Eksakt token-count er nevneren som skal brukes
når payloaden under er tilgjengelig.

### Live payload: `POST /api/corpus/token-stats`

Kall dette når `effectiveFilterIds` endres, ikke per Trend-søk. Korpuset i
Konk er bare `filterIds`; backend hasher den sorterte id-listen og cacher
årssummene.

Request bruker samme filterkontrakt som `/near_query`:

```json
{
  "useFilter": true,
  "filterIds": [100011001, 100011002]
}
```

- `useFilter: false` ignorerer `filterIds` og summerer hele shard-korpuset.
  `corpusHash` blir da `"all"`.
- `useFilter: true` med tom `filterIds` gir nullstillte totaler, ikke hele
  korpuset.
- `useFilter: true` med id-liste summerer bare bøker som finnes i
  token-cachen. `requestedBookCount` er antall unike id-er i requesten;
  `bookCount` er hvor mange av dem som faktisk hadde tokenmengde.

TypeScript-hjelper: `buildCorpusTokenStatsRequest` i
`src/lib/searchRequests.ts`.

Svar:

```json
{
  "corpusHash": "a1b2c3…",
  "useFilter": true,
  "requestedBookCount": 1940,
  "bookCount": 1940,
  "booksWithTokens": 1940,
  "totalTokens": 123456789,
  "tokensWithoutYear": 0,
  "tokensByYear": {
    "1881": 27542825,
    "1882": 22852396
  },
  "rows": [
    { "year": 1881, "nTokens": 27542825 },
    { "year": 1882, "nTokens": 22852396 }
  ],
  "cached": true,
  "source": "token_blocks"
}
```

Felt:

- `corpusHash`: `"all"` eller sha256 av sorterte unique int64-`filterIds`.
  Stabil nøkkel for frontend-cache.
- `totalTokens`: nevner for relativ frekvens over hele det aktive utvalget.
- `tokensByYear` / `rows`: nevner per år. Bruk `rows[i].nTokens` mot
  Trend-radens `total` for samme år:
  `rel_freq(year) = hits(year) / nTokens(year)`.
- `tokensWithoutYear`: token i shard-bøker uten `year` i `corpus`. Ta dem
  med i `totalTokens`, men ikke i årsserien.
- `source`: alltid `"token_blocks"` i denne versjonen.
- `cached`: om subsett-aggregatet allerede lå i backend-cachen.

Lokalt uten VPN: kontrakten og typene er nok til å bygge relativ/kohort-UI
mot mock eller senere live API. Endepunktet lander på
`https://api.nb.no/dhlab/imag/api/corpus/token-stats` først etter backend-deploy.
Før det: 404. Ikke blokker Trend-absolutt på manglende payload.

## Komplekse termgrupper

Et søk som:

```text
[i, paa][morgen, kveld]
```

har fire kartesiske kombinasjoner. Slike søk kan multiplisere SIMD-kostnaden.
Frontend viser foreløpig bare separate serier for den første gruppen og
opplyser at senere nærhetsgrupper er utelatt i Telling/Trend. Konk bruker hele
søket.

Før alle kombinasjoner aktiveres:

- mål kostnaden
- beregn kombinasjonsantall før kjøring
- sett et hardt tak
- bruk begrenset samtidighet og avbrytbar fremdrift
- vurder ett samlet backendkall som kan gjenbruke postings og dekodet data

Fire linjer kan vises direkte. Ved flere kombinasjoner kan de tre største etter
samlet treffmengde vises som standard, med eksplisitt valg av øvrige linjer.

## Foreslått backendrespons for sampling

Et fremtidig svar bør kunne oppgi:

```json
{
  "estimate": 0,
  "sampleDocuments": 0,
  "populationDocuments": 0,
  "sampleTokens": 0,
  "populationTokens": 0,
  "standardError": 0,
  "confidenceLow": 0,
  "confidenceHigh": 0,
  "seed": 0,
  "samplingStrategy": "stratified-document",
  "isEstimate": true
}
```

For trend må tilsvarende informasjon kunne gis per år.

## Prototype og benchmark

Bruk ImagiNation som fasitkorpus:

1. Kjør eksakte tellinger.
2. Sammenlign med eksempelvis 1 %, 2 %, 5 % og 10 % sample.
3. Mål feil, konfidensdekning og responstid.
4. Sammenlign dokument- og chunk-sampling.
5. Test vanlige, sjeldne og svært høyfrekvente uttrykk.

Representative søk:

- ett sjeldent ord
- ett svært vanlig ord
- `". ,"` med nærhet 5
- `[spise, sove]`
- `[i, paa][morgen, kveld]`
- et flerordssøk nær chunkgrensen

Prototypebeslutningen bør tas ut fra redusert SIMD-arbeid, ekstra
indekserings-/lagringskostnad og om usikkerhetsestimatene faktisk har rimelig
dekning.
