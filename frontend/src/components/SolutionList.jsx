import React from 'react'
function SolutionList({ solutions = [], onDelete }) {
  if (!solutions.length) {
    return <p className="empty-state-message">No solutions found.</p>
  }

  return (
    <div className="solution-list" role="list">
      {solutions.map((solution) => (
        <article key={solution.id} className="solution-item" role="listitem">
          <h3 className="solution-question">{solution.question}</h3>
          <p className="solution-answer">{solution.answer}</p>
          {onDelete ? (
            <button
              type="button"
              className="secondary-action-button"
              onClick={() => onDelete(solution.id)}
            >
              Delete
            </button>
          ) : null}
        </article>
      ))}
    </div>
  )
}

export default SolutionList

