/** Non-functional. Typing still filters tiles from the keyboard. */
export function SearchPill() {
  return (
    <div className="search-pill" role="search" aria-disabled="true">
      <span className="search-mark" aria-hidden="true" />
      <span>Search</span>
    </div>
  );
}
