import React from 'react'
import { useState } from 'react'

function SolutionForm({ onAdd }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()

    const trimmedQuestion = question.trim()
    const trimmedAnswer = answer.trim()

    if (!trimmedQuestion || !trimmedAnswer) {
      setError('Question and answer are required.')
      return
    }

    setError('')
    await onAdd({ question: trimmedQuestion, answer: trimmedAnswer })
    setQuestion('')
    setAnswer('')
  }

  return (
    <form className="dashboard-search" onSubmit={handleSubmit}>
      <h2 className="section-title">Add Solution</h2>

      <textarea
        className="search-textarea"
        rows={3}
        placeholder="Question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
      />

      <textarea
        className="search-textarea"
        rows={4}
        placeholder="Answer"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
      />

      {error ? <p className="validation-message">{error}</p> : null}

      <button type="submit" className="primary-action-button">
        Save Solution
      </button>
    </form>
  )
}

export default SolutionForm

