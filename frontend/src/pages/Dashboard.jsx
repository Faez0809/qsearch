import React from 'react'
import { useEffect, useState } from 'react'
import SearchBox from '../components/SearchBox'
import ResultCard from '../components/ResultCard'

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD
    ? 'https://qsearch-9ejl.onrender.com'
    : 'http://127.0.0.1:8000')
const buildUrl = (path) => `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchWithRetry = async (path, options = {}, retries = 4, waitMs = 3000) => {
  const timeoutMs = options.timeoutMs ?? 25000
  const requestOptions = { ...options }
  delete requestOptions.timeoutMs

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(buildUrl(path), {
        ...requestOptions,
        signal: controller.signal,
      })
      if (response.ok) {
        clearTimeout(timeoutId)
        return response
      }
    } catch {
      // Retry on transient network or cold-start issues.
    } finally {
      clearTimeout(timeoutId)
    }
    if (attempt < retries) {
      await sleep(waitMs)
    }
  }
  throw new Error('Backend request failed after retries')
}

function Dashboard() {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [results, setResults] = useState([])
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    const abortController = new AbortController()
    let keepPolling = true

    const checkBackendHealth = async (markChecking = false) => {
      if (markChecking) {
        setBackendStatus('checking')
      }

      try {
        await fetchWithRetry(
          '/health',
          { signal: abortController.signal },
          10,
          4000,
        )
        if (keepPolling) {
          setBackendStatus('connected')
        }
      } catch {
        if (keepPolling) {
          setBackendStatus('offline')
        }
      }
    }

    checkBackendHealth(true)

    const intervalId = setInterval(() => {
      if (keepPolling) {
        checkBackendHealth()
      }
    }, 45000)

    return () => {
      keepPolling = false
      clearInterval(intervalId)
      abortController.abort()
    }
  }, [])

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
      const response = await fetchWithRetry('/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: trimmedQuery }),
        timeoutMs: 20000,
      }, 3, 2000)

      const data = await response.json()
      setBackendStatus('connected')
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

