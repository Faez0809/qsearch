import React from 'react'

function ResultCard({ result }) {
  return (
    <article className="result-card">
      <div className="result-card-header">
        <h3 className="result-question">{result.question}</h3>
        <span className="match-badge">{result.match}% match</span>
      </div>

      <div className="result-image-placeholder" aria-hidden="true">
        Image Preview Placeholder
      </div>

      <div className="result-card-actions">
        <button type="button" className="secondary-action-button">
          ▶ Play audio
        </button>
        <button type="button" className="primary-action-button">
          Select
        </button>
      </div>
    </article>
  )
}

export default ResultCard
