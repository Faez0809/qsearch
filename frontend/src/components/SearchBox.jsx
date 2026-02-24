function SearchBox() {
  return (
    <section className="dashboard-search" aria-label="Search inputs">
      <h2 className="section-title">Search Question</h2>
      <textarea
        className="search-textarea"
        rows={5}
        placeholder="Describe the question or paste exam text here..."
      />
      <label className="file-upload-field">
        <span>Upload reference image</span>
        <input type="file" accept="image/*" />
      </label>
      <button type="button" className="primary-action-button">
        Search
      </button>
    </section>
  )
}

export default SearchBox
