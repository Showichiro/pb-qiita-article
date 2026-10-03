# SP layout plan and UI proposal

Scope: article search, ranking, time-series analysis, and the shared page shell.
Breakpoint: below 640px; desktop presentation stays available from 640px.
Reference: the supplied Linear mobile issue list, adapted to the existing theme.
The filter interaction uses a bottom half-modal sheet.

## UI proposal

- List first: a pill-shaped “絞り込み・表示設定” button opens a native dialog
  from the bottom, occupying 60% of the dynamic viewport height. The sheet has
  a fixed header/footer and scrollable controls; the article list stays in place
  behind its backdrop. Desktop keeps the same form inline.
- Modal behavior: background scrolling is locked and the native dialog isolates
  keyboard focus. Close via the header, “結果を見る”, Escape or backdrop; focus
  returns to the opener. Closing keeps edited fields mounted. Switching to
  desktop closes the React modal. The native GET fallback uses dialog invokers
  and the footer submits its form.
- Filters: one column with full-width native controls, 16px control text and
  44px minimum touch height. GET fallback remains usable without JavaScript.
- Articles: compact rows separated by lines. Title, author and wrapping tags
  occupy full width; likes/stocks share a row, followed by the publication date.
  One semantic table and one set of links serve both desktop and SP.
- Mobile article feed: append the next page when the bottom comes within 200px.
  Keep a “もっと見る” button, explicit retry, and an end-of-list message.
  The URL describes the search/start page; appending does not create history.
- Feed cache keys include every committed filter, starting offset and adopted
  data generation. Search changes and generation adoption select a fresh feed.
  Requests use AbortSignal; repeated article IDs are displayed once.
- Ranking / analysis: charts fit the container and wide tables scroll locally.
  They use finite results, so infinite scrolling applies only to article search.

## Completed work

1. Created an Orca worktree from origin/main.
2. Added shared responsive shell, filter sheets and article cell labels.
3. Added a TanStack Query infinite feed for SP; retained desktop and native
   fallback pagination. Focused fallback controls open their client disclosure.
4. Added regression tests for append/retry/end-of-list and filter reset.
5. Verified native screens at 320, 375, 390, 640 and 1280px with long titles,
   tags and author IDs. No page-wide horizontal overflow; filter open/closed
   states and desktop inline forms checked with Chromium. Modal height/bottom
   alignment, background scroll locking, Escape, backdrop close, focus return,
   keyboard isolation, draft persistence and desktop resize checked.
6. Verified emitted React assets in Chromium with synthetic API responses:
   scrolling appended all seven articles, end-of-list appeared, and editing
   filters updated the URL. Screenshots are linked below.

## Validation and limits

- TypeScript, Biome lint and the full Vitest suite are run for the PR.
- Vite produced client and Worker assets. The local build also printed a Docker
  daemon connection diagnostic; the machine has no running Docker Desktop.
- Browser verification uses local synthetic data, not production D1.
- iOS Safari and actual device checks remain manual follow-up validation.
- Browser back restores the URL's starting page; previously appended rows may
  come from the query cache. Pixel-perfect scroll-position restoration is not
  part of this change.

## UI previews

[React filter half-modal](../artifacts/articles-filter-sheet-mobile.png)

[React article feed](../artifacts/articles-enhanced-mobile.png)

[Native article fallback](../artifacts/articles-mobile.png)

[Ranking](../artifacts/ranking-mobile.png)

[Analysis](../artifacts/analysis-mobile.png)
