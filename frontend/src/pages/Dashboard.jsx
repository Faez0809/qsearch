import { useEffect, useState } from 'react'
import { searchQuery } from '../api/search'

const HISTORY_STORAGE_KEY = 'qsearch-history'

function getConfidenceColor(score) {
  if (score > 70) return 'green'
  if (score > 40) return 'orange'
  return 'red'
}

function Dashboard() {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [results, setResults] = useState([])
  const [backendStatus, setBackendStatus] = useState('checking')
  const [searchHistory, setSearchHistory] = useState([])

  useEffect(() => {
    const abortController = new AbortController()

    const checkBackendHealth = async () => {
      try {
        await fetch('http://127.0.0.1:8000/health', {
          signal: abortController.signal,
        })

        setBackendStatus('connected')
      } catch {
        setBackendStatus('offline')
      }
    }

    checkBackendHealth()

    return () => {
      abortController.abort()
    }
  }, [])

  useEffect(() => {
    const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!savedHistory) {
      return
    }

    try {
      const parsedHistory = JSON.parse(savedHistory)
      if (Array.isArray(parsedHistory)) {
        setSearchHistory(parsedHistory)
      }
    } catch {
      localStorage.removeItem(HISTORY_STORAGE_KEY)
    }
  }, [])

  const updateSearchHistory = (newQuery) => {
    setSearchHistory((previousHistory) => {
      const updatedHistory = [newQuery, ...previousHistory.filter((item) => item !== newQuery)].slice(0, 5)
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory))
      return updatedHistory
    })
  }

  const runSearch = async (rawQuery) => {
    const trimmedQuery = rawQuery.trim()

    if (!trimmedQuery) {
      setValidationMessage('Please enter a question before searching.')
      setResults([])
      return
    }

    setValidationMessage('')
    setIsLoading(true)

    try {
      const data = await searchQuery(trimmedQuery)
      setResults(data)
      updateSearchHistory(trimmedQuery)
    } catch {
      setValidationMessage('Unable to search right now. Please try again.')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = () => runSearch(query)

  const handleHistorySearch = (historyQuery) => {
    setQuery(historyQuery)
    runSearch(historyQuery)
  }

  return (
    <div className="dashboard-layout">
      <div className="dashboard-panel">
        <p className="backend-status-message status-message-fade-in" role="status" aria-live="polite">
          {backendStatus === 'checking'
            ? 'Checking backend connection...'
            : backendStatus === 'connected'
              ? 'Backend Connected ✅'
              : 'Backend Offline ❌'}
        </p>

        <section className="dashboard-search" aria-label="Search inputs">
          <h2 className="section-title">Search Question</h2>
          <input
            className="search-input"
            type="text"
            placeholder="Type Bangla/Banglish query..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
            onClick={handleSearch}
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

        {searchHistory.length > 0 && (
          <section className="search-history" aria-label="Recent searches">
            <h3 className="history-title">Recent searches</h3>
            <div className="history-list">
              {searchHistory.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="history-chip"
                  onClick={() => handleHistorySearch(item)}
                  disabled={isLoading}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="dashboard-panel">
        <h2 className="section-title">Top Results</h2>
        {isLoading ? (
          <div className="results-loading" role="status" aria-live="polite">
            <span className="loading-spinner loading-spinner-large" aria-hidden="true" />
            <span>Searching...</span>
          </div>
        ) : results.length ? (
          <div className="results-stack">
            {results.slice(0, 3).map((result, index) => (
              <article key={`${result.text}-${index}`} className="result-card">
                <h3 className="result-question">{result.text}</h3>
                <p className="result-similarity" style={{ color: getConfidenceColor(result.similarity) }}>
                  Similarity: {result.similarity}%
                </p>

                {result.image_path ? (
                  <img
                    className="result-image"
                    src={`http://127.0.0.1:8000${result.image_path}`}
                    alt={result.text}
                    loading="lazy"
                  />
                ) : null}

                {result.audio_path ? (
                  <audio controls className="result-audio">
                    <source src={`http://127.0.0.1:8000${result.audio_path}`} />
                    Your browser does not support audio playback.
                  </audio>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state-message">No results yet. Search to see matches.</p>
        )}
      </div>
    </div>
  )
}

export default Dashboard
