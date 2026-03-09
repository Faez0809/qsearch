import React from 'react'
import { useEffect, useState } from 'react'
import SearchBox from '../components/SearchBox'
import ResultCard from '../components/ResultCard'

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD
    ? 'https://qsearch-9ejl.onrender.com'
    : 'http://127.0.0.1:8000')

function Dashboard() {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [results, setResults] = useState([])
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    const abortController = new AbortController()
    let keepPolling = true

    const checkBackendHealth = async () => {
      const maxAttempts = 12
      setBackendStatus('checking')

      for (let attempt = 1; attempt <= maxAttempts && keepPolling; attempt += 1) {
        try {
          const response = await fetch(`${API_BASE}/health`, {
            signal: abortController.signal,
          })

          if (!response.ok) {
            throw new Error('Backend health check failed')
          }

          setBackendStatus('connected')
          return
        } catch {
          if (attempt === maxAttempts) {
            setBackendStatus('offline')
            return
          }
          // Render free tier can cold-start slowly, especially on mobile networks.
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      }
    }

    checkBackendHealth()

    const intervalId = setInterval(() => {
      if (keepPolling && backendStatus !== 'connected') {
        checkBackendHealth()
      }
    }, 30000)

    return () => {
      keepPolling = false
      clearInterval(intervalId)
      abortController.abort()
    }
  }, [backendStatus])

  const handleSearch = async () => {
    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      setValidationMessage('Please enter a question before searching.')
      setResults([])
      return
    }

    setValidationMessage('')
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: trimmedQuery }),
      })

      if (!response.ok) {
        throw new Error('Search request failed')
      }

      const data = await response.json()
      setResults(Array.isArray(data) ? data : [])
    } catch {
      setValidationMessage('Unable to search right now. Please try again.')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="dashboard-layout">
      <div className="dashboard-panel">
        <p className="backend-status-message status-message-fade-in" role="status" aria-live="polite">
          {backendStatus === 'checking'
            ? 'Checking backend connection (waking up server if needed)...'
            : backendStatus === 'connected'
              ? 'Backend connected'
              : 'Backend offline'}
        </p>

        <SearchBox
          query={query}
          onQueryChange={setQuery}
          onSearch={handleSearch}
          isLoading={isLoading}
          validationMessage={validationMessage}
        />
      </div>

      <div className="dashboard-panel">
        <h2 className="section-title">Results</h2>
        {isLoading ? (
          <div className="results-loading" role="status" aria-live="polite">
            <span className="loading-spinner loading-spinner-large" aria-hidden="true" />
            <span>Searching for matching solutions...</span>
          </div>
        ) : !results.length ? (
          <p className="empty-state-message">No solutions found.</p>
        ) : (
          <div className="results-stack">
            {results.map((result, index) => (
              <ResultCard key={`${result.text}-${index}`} result={result} apiBase={API_BASE} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard

