# Backend-handoff: Roaring, chunks og adaptiv sampling

Dette notatet samler ideene som skal vurderes når arbeidet fortsetter i
backend-repositoriet. Det beskriver en prototype, ikke en låst kontrakt.

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

Kontroller om eksakt `token_count` allerede finnes per dokument. Historikken
antyder at sekvenslengde eller bok-token-count kan være tilgjengelig. Hvis
feltet finnes, summeres det per år og aktivt subkorpus og brukes som nevner.

Planlagte trendvisninger:

- **Absolutt:** rå treff per år.
- **Relativ:** treff delt på tokenmengde samme år.
- **Kohort:** hvert sammenlignet uttrykk delt på summen av alle uttrykkene
  samme år.

År med kohortsum null skal være manglende data, ikke null prosent.

Proxyen med høyfrekvente referansetoken kan beholdes som kontroll/fallback,
men eksakt token-count er å foretrekke dersom den er like billig å hente.

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
