# Search screen ownership

`useArticlesSearch`, `useAnalysisSearch`, and `useRankingSearch` own each
screen's search lifecycle: editable drafts, validation, URL/history updates,
debounce and composition state, request intent, retries, and data-version
adoption. They also observe the accepted query's cached results. A failed
request must leave those results visible while retaining the requested URL
and editable draft.

Each hook returns a `form` contract containing controlled values and event
handlers. `ArticlesSearchForm`, `AnalysisSearchForm`, and `RankingSearchForm`
render that contract without owning drafts, refs, URL writes, or requests.
Their prop types are derived from the contract so handler and value changes
are checked together. Applied-filter summaries use the accepted `query`;
input controls use `draft`. Ranking and analysis presentation choices remain
separate from the data request.

The App components compose the form, version controls, request status, and
results. Articles keeps its page-size control after the results through
`ArticlesPageSizeControl`, which shares the form contract and preserves the
native `form` attribute. Form IDs, names, actions, and focus markers must stay
compatible with the native-form handoff in the mount modules.

Keep event ordering in the hooks: draft edits invalidate older requests,
history navigation cancels scheduled searches, and successful loads commit
only the current request intent. Ranking display handlers read the latest
query ref so display changes during a pending date request are retained.
The existing App and mount tests cover these contracts through user actions.
