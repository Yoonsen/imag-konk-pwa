# TREND.md

This note captures the current trendline behavior in `imag-konk-pwa`, the
observed "zoom changes the story" issue, and the frontend-side fixes applied.

## What We Checked

We compared the frontend trend view with backend `near_query(mode="year-count")`
responses for the query `demokratiet`.

Key finding:

- the backend returns the same year-by-year values for overlapping years whether
  the request covers the full range or starts later (for example `startYear=1860`)
- therefore the confusing behavior was not caused by the backend count data

## Root Cause

The misleading effect came from the frontend trend presentation:

1. the chart was visually compressed over long year ranges
2. the line was plotted against point index, not actual year spacing
3. in trend mode, the selected year range also affected the local corpus filter,
   which made zoom behave more like a corpus slice than a pure viewport

This is the classic trendline "squishing" problem: one or a few dominant years
can flatten the rest of the curve, and zooming then makes later variation look
dramatically larger even when the underlying values are unchanged.

## Changes Applied

The trend UI was updated in `src/App.tsx` to:

- plot trend points on the X-axis by actual year rather than array index
- report `År med treff` as years with `total > 0`, not just row count
- treat the year range as a trend viewport in `year-count` mode instead of an
  extra frontend corpus filter
- allow clicking a trend point to open concordances for that exact year within
  the same active corpus context

## Current Drilldown Behavior

Trend drilldown is now transient rather than stateful.

When the user is in `Trend` mode and hovers a year point:

- the frontend marks that year as the active point
- the UI shows two drilldown choices:
  - `Dette året`
  - `+/- 5 år`

When the user picks one of those actions:

- the app sends a temporary concordance request to the backend
- the request uses the same active corpus context as the trend view
- only the request-level year filter changes
- concordances open in a modal using the normal concordance rendering
- the main search state remains unchanged (`query`, `resultMode`, `yearRange`)

This is implemented entirely in the frontend by reusing the existing concordance
request logic with transient overrides.

## Backend Verification Reminder

If trend values look suspicious again, verify the backend first with
`near_query(mode="year-count")` before changing the chart logic.

For `demokratiet`, the overlapping years matched exactly between:

- full-range series
- `startYear=1860` series

That comparison ruled out a backend counting bug for this case.
