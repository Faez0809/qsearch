import React from 'react'
function SearchBox({
  query,
  onQueryChange,
  onSearch,
  isLoading,
  validationMessage,
}) {
  return (
    <section className="dashboard-search" aria-label="Search inputs">
      <h2 className="section-title">Search Question</h2>
      <textarea
        className="search-textarea"
        rows={5}
        placeholder="Describe the question or paste exam text here..."
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-invalid={Boolean(validationMessage)}
        aria-describedby={validationMessage ? 'search-validation-message' : undefined}
      />
      {validationMessage && (
        <p id="search-validation-message" className="validation-message" role="alert">
          {validationMessage}
        </p>
      )}
      <button
        type="button"
        className="primary-action-button"
        onClick={onSearch}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <span className="loading-spinner" aria-hidden="true" />
            Searching...
          </>
        ) : (
          'Search'
        )}
      </button>
    </section>
  )
}

export default SearchBox

