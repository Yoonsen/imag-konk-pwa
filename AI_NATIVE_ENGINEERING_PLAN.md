# Plan for AI-native utvikling og NTNU-overlevering

## Mål

ImagiNation korpusutforsker skal kunne forstås, vedlikeholdes og utvides av en
humanist i samarbeid med en kodeagent. En ny agent skal kunne finne faglig
hensikt, søkesemantikk, API-kontrakter, begrensninger og relevante tester uten å
måtte rekonstruere alt fra `App.tsx` og historiske samtaler.

Dokumentasjonen skal være en testbar spesifikasjon. Målet er ikke å beskrive
hver kodelinje, men å gjøre faglige regler og tekniske kontrakter entydige.

## Prinsipper

1. **Faglig språk først**
   - Forklar hva brukeren undersøker før implementasjonen beskrives.
   - Definer ord som anker, OR-gruppe, nærhet, sample, kohort og relativ frekvens.

2. **Én dokumentert betydning**
   - Notasjon og parametre skal ha samme betydning i Konk, Telling og Trend.
   - Forskjeller mellom visningsmodusene skal beskrives eksplisitt.

3. **Kontrakter fremfor antakelser**
   - Requests, responser, standardverdier og feiltilfeller dokumenteres med
     representative eksempler.
   - Maskinlesbare skjemaer foretrekkes der backend støtter det.

4. **Regler kobles til tester**
   - Viktige påstander i dokumentasjonen skal kunne spores til en test.
   - Endret søkesemantikk krever både dokumentasjons- og testendring.

5. **Små kontekster for agenter**
   - Hver funksjon får et avgrenset dokument og etter hvert en avgrenset
     kodemodul.
   - En agent skal sjelden måtte lese hele applikasjonen for å gjøre én endring.

6. **Versjonert faglig atferd**
   - SemVer, endringslogg og Git-commit identifiserer hvilken atferd brukeren
     faktisk møtte.
   - Endringer i telling eller søkesemantikk behandles som kontraktsendringer.

## Foreslått dokumentstruktur

```text
docs/
  PRODUCT_MODEL.md
  GLOSSARY.md
  REPOSITORY_MAP.md
  features/
    search-syntax.md
    concordance.md
    counting.md
    trends.md
    comparisons.md
    corpus-upload.md
    geo.md
    export.md
  contracts/
    near-query.md
    near-fragments.md
    or-query.md
    token-stats.md
    metadata.md
  decisions/
    ADR-001-search-notation.md
  fixtures/
    README.md
    representative-responses/
```

Eksisterende `TREND.md`, `SEARCH_PARAMETER_ROADMAP.md`,
`RELATIVE_FREQUENCY_PROXY.md` og `BACKEND_CHUNK_SAMPLING_HANDOFF.md` skal
innarbeides eller lenkes tydelig fra denne strukturen, ikke kopieres uten
eierskap.

## Mal for et funksjonsdokument

Hvert dokument under `docs/features/` bør inneholde:

1. **Formål**
   - Hvilket humanistisk eller undervisningsmessig behov funksjonen dekker.

2. **Brukerflyt**
   - Et kort, konkret eksempel fra input til tolkning og resultat.

3. **Begreper og notasjon**
   - Gyldig syntaks, betydning og representative eksempler.

4. **Invarianter**
   - Regler som ikke må endres utilsiktet.
   - Eksempel: `[x,y]` er én OR-union, mens `{x; y}` er to separate søk.

5. **API-kontrakt**
   - Endepunkt, payload, respons, standardverdier og feilkoder.
   - Lenke til detaljert kontraktsdokument og maskinlesbart skjema.

6. **Ytelse og grenser**
   - Sampling, maksstørrelser, sekvensiell behandling og kjente kostnader.

7. **Tilgjengelighet og formidling**
   - Hvordan resultatet forklares uten å kreve teknisk eller statistisk
     forkunnskap.

8. **Kjente begrensninger**
   - Uferdige eller bevisst utsatte deler.

9. **Kodekart**
   - Ansvarlige komponenter, biblioteksfiler og backend-moduler.

10. **Tester**
    - Testfiler og konkrete regler de beskytter.

11. **Trygg utvidelse**
    - Hva en agent normalt må endre, kontrollere og dokumentere.

## API-kontrakter og testdata

For hvert endepunkt skal vi dokumentere:

- payload-felter med type, standardverdi og faglig betydning
- hvilke felt som er obligatoriske i hver modus
- responsformer for treff, tomt resultat og feil
- tellingens enhet og hvilket termsett som er anker
- hvordan corpusfilter og årsvindu påvirker beregningen
- kjente ytelsesegenskaper og trygge grenser
- minst ett lite, stabilt request/response-eksempel

Der det er praktisk opprettes OpenAPI- eller JSON Schema-filer i backend.
Frontend lagrer små, anonymiserte fixtures for kontraktstester og lokal
utvikling. Fixtures skal ikke late som de erstatter integrasjonstester mot
backend.

## Faser frem mot overlevering

### Fase 1 – Faglig grunnmur

- Opprett `PRODUCT_MODEL.md`, `GLOSSARY.md` og `REPOSITORY_MAP.md`.
- Flytt søkenotasjon og sammenligningssemantikk til egne dokumenter.
- Registrer kjente mangler, særlig Telling/Trend for `#geo`.
- Innfør dokumentmalen og koblinger fra `AGENTS.md`.

**Ferdig når:** En ny agent kan forklare `[x,y] z`, `{x z; y z}`, Konk,
Telling og Trend korrekt ved kun å lese dokumentasjonen.

### Fase 2 – Kontrakter

- Dokumenter alle aktive frontend–backend-endepunkter.
- Avklar ankersemantikk, telling, tokenstatistikk og årsrader med backend.
- Legg til representative fixtures og kontraktstester.
- Etabler rutine for koordinert kontraktsendring i begge repositorier.

**Ferdig når:** En payload kan valideres og et typisk svar kan tolkes uten å
lese implementasjonskoden.

### Fase 3 – Modulær kode

- Del opp `App.tsx` etter funksjonsområdene i dokumentstrukturen.
- Flytt parsing, request-bygging, resultatmodeller og eksport til testbare
  biblioteksmoduler.
- La komponentene eie presentasjon, ikke søkesemantikk.
- Behold ende-til-ende-tester mens ansvaret flyttes.

**Ferdig når:** En agent kan endre én funksjon ved å lese ett
funksjonsdokument og et lite antall tilhørende filer.

### Fase 4 – Agentvennlig endringsflyt

- Lag sjekklister for faglig endring, UI-endring og API-endring.
- Krev oppdatering av dokument, kontrakt og test i samme endring.
- Legg til kommandoer for rask lokal verifikasjon.
- Beskriv hvordan feilrapporter skal inneholde appversjon, build og søk.
- Evaluer dokumentasjonen med oppgaver utført av en fersk agent.

**Ferdig når:** En humanist kan beskrive en ønsket faglig endring, og agenten
kan foreslå korrekt avgrensning, implementasjon og test uten skjult
samtalekontekst.

### Fase 5 – NTNU-overlevering

- Avklar eierskap til frontend, backend, dokumentasjon og deploy.
- Dokumenter release-, rollback- og hendelseshåndtering.
- Opprett en vedlikeholdt liste over åpne faglige og tekniske beslutninger.
- Gjennomfør en rekonstrueringsøvelse i et rent miljø.
- Samle erfaringer fra studentbruk og prioriter etter observerte behov.

**Ferdig når:** NTNU kan drifte og videreutvikle appen med egne humanister,
utviklere og agenter uten avhengighet til tidligere samtalehistorikk.

## Rekonstruksjonstest

Minst én gang før overlevering skal en agent i et rent miljø få:

- repository og dokumentasjon
- API-kontrakter og fixtures
- standard bygg- og testkommandoer

Agenten skal deretter kunne:

1. forklare produktets viktigste faglige regler
2. bygge og kjøre appen
3. gjenopprette en avgrenset funksjon fra dokument og kontrakt
4. oppdage avvik mellom dokumentasjon, tester og implementasjon
5. levere en liten endring med riktig dokumentasjons- og testoppdatering

Resultatet brukes til å forbedre dokumentasjonen, ikke bare til å evaluere
agenten.

## Første oppgaver når planen tas opp igjen

1. Opprett `docs/` og mal for funksjonsdokumenter.
2. Skriv `search-syntax.md` og ADR for `[]`, `{}` og `;`.
3. Skriv kontrakten for `near_query`, inkludert anker- og year-count-semantikk.
4. Dokumenter nåværende status og mangler for `#geo`.
5. Lag `REPOSITORY_MAP.md` før videre oppdeling av `App.tsx`.
