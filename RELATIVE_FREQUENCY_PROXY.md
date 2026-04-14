# Relativ frekvens med referansetoken

## Idé
For raske frekvenskurver i store korpus kan vi bruke ett eller flere svært vanlige token som proxy for total tokenmasse, i stedet for å beregne faktisk totalt antall ord i korpuset for hver spørring.

Siden enkeltordtelling er svært rask, kan vi i samme materiale telle:
- måluttrykket
- referansetoken som `,` og `.`

Hvis disse referansetokenene følger den totale tekstmengden stabilt nok, kan forholdet brukes som en robust approksimasjon på relativ frekvens.

## Forslag
Bruk summen av komma og punktum som normaliseringsgrunnlag:

```text
rel_freq(query) = hits(query) / (hits(',') + hits('.'))
```

Eventuelt skalert til et mer lesbart tall:

```text
scaled_freq(query) = 100000 * hits(query) / (hits(',') + hits('.'))
```

Dette gir ikke nødvendigvis en eksakt absolutt frekvens per 100 000 ord, men en rask og stabil proxy som egner seg godt til trendanalyse.

## Hvorfor dette er nyttig
- enkeltordtelling går lynraskt
- vi slipper å beregne total tokenmasse eksplisitt for hvert korpus eller hver årsbøtte
- metoden gir svært like trendlinjer som normalisering mot faktiske totaler
- den kan brukes på vilkårlige korpus og delkorpus

## Anbefalt praksis
- bruk både `,` og `.` i nevneren, ikke bare ett tegn
- bruk samme referansetoken konsekvent på tvers av alle søk
- beregn normalisering innen samme utvalg som måluttrykket
- for trendlinjer per år: tell både query og referansetoken innen samme årsbøtte og samme sample

## Eksempel per år
For hvert år `y`:

```text
freq_y(query) = hits_y(query) / (hits_y(',') + hits_y('.'))
```

Da får vi en sammenlignbar tidsserie som er billig å beregne.

## Styrker
- rask
- enkel å implementere
- skalerer godt
- gir praktisk talt samme trendform som mer kostbar normalisering, i våre tester

## Forbehold
Metoden er en proxy, ikke en perfekt rekonstruksjon av total ordmengde. Avvik kan oppstå ved:
- sterke sjangerforskjeller
- endringer i tegnsettingspraksis over tid
- OCR-støy eller tokeniseringsfeil
- teksttyper med atypisk tegnsetting, som lyrikk eller dramatikk

Likevel ser metoden ut til å være god nok for interaktive trendkurver, særlig når målet er å sammenligne utvikling over tid heller enn å estimere eksakt absolutt frekvens.

## Praktisk anbefaling
For interaktiv plotting:
- tell query raskt
- tell `,` og `.`
- normaliser med forholdet over
- bruk stratifisert sampling ved store korpus hvis nødvendig
- behold denne metoden som standard for raske frekvenskurver
