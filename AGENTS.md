# AGENTS.md

This repository is the React/Vite PWA for ImagiNation concordances and trend
inspection.

## Working Paths

- repo root:
  - `/mnt/disk1/Github/imag-konk-pwa`
- backend/API repo used by this app:
  - `/mnt/disk1/Github/sqlite-backend`

## Read This First

When working on trends or concordance UX in this app, read:

1. `README.md`
   - basic app purpose and usage
2. `TREND.md`
   - trendline behavior, known "squishing" effect, and current click-to-concordance flow

## Mental Model

The frontend does not own the yearly counts.

- trend data comes from backend `POST /near_query` with `mode="year-count"`
- concordance rows come from backend `POST /near_query`, `POST /near_fragments`,
  or `POST /or_query` depending on query shape
- if a trend looks wrong, verify backend year rows before changing chart logic

## Trend Notes

- Trend mode should treat the selected year range as a visible time window, not
  an extra local corpus slice.
- Plot trend points against actual year values, not array position.
- Dominant years can visually flatten the rest of the series; this is a normal
  autoscaling effect, not necessarily a backend bug.
- Trend points are clickable and should open concordances for the selected year
  within the same active corpus context.

## Important Files

- `src/App.tsx`
  - main app logic, query building, trend rendering, and click-to-concordance behavior
- `src/App.css`
  - trend chart styling and result layout
- `public/corpus.json`
  - local corpus metadata used for frontend-side filtering

## Do / Don't

Do:

- verify backend `year-count` rows before diagnosing trend bugs as API bugs
- preserve the user's active corpus constraints when drilling from trend to concordance
- keep trend explanations explicit when autoscaling can mislead users

Don't:

- treat chart squishing as proof of a backend counting error
- plot long trend series against point index when actual year spacing is known
- make trend zoom silently change the corpus basis unless that is the intended feature
