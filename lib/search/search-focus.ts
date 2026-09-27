export const SEARCH_INPUT_ID = "tool-search";

// Set when Cmd/Ctrl+K is pressed on a page without the search input; the home
// page's search consumes it after the client-side navigation lands.
let pendingFocus = false;

export function requestSearchFocus(): void {
  pendingFocus = true;
}

export function consumeSearchFocus(): boolean {
  const pending = pendingFocus;
  pendingFocus = false;
  return pending;
}
