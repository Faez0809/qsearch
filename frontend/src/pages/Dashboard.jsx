import React from 'react'
import { useEffect, useState } from 'react'
import SearchBox from '../components/SearchBox'
import ResultCard from '../components/ResultCard'

const PRIMARY_API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD
    ? '/api'
    : 'http://127.0.0.1:8000')
const RENDER_API_BASE = 'https://qsearch-9ejl.onrender.com'
const API_BASES = import.meta.env.PROD
  ? [PRIMARY_API_BASE, RENDER_API_BASE]
  : [PRIMARY_API_BASE]

const buildUrl = (base, path) =>
  `${base}${path.startsWith('/') ? '' : '/'}${path}`

const fetchWithFallback = async (path, options) => {
  const uniqueBases = [...new Set(API_BASES)]

  for (const base of uniqueBases) {
    try {
      const response = await fetch(buildUrl(base, path), options)
      if (response.ok) {
        return response
      }
    } catch {
      // Try next backend target.
    }
  }
  throw new Error('All backend targets failed')
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
    let inFlight = false

    const checkBackendHealth = async (markChecking = false) => {
      if (inFlight) {
        return
      }
      inFlight = true
      const maxAttempts = 12
      if (markChecking) {
        setBackendStatus('checking')
      }

      for (let attempt = 1; attempt <= maxAttempts && keepPolling; attempt += 1) {
        try {
          const response = await fetchWithFallback('/health', {
            signal: abortController.signal,
          })

          setBackendStatus('connected')
          inFlight = false
          return
        } catch {
          if (attempt === maxAttempts) {
            setBackendStatus('offline')
            inFlight = false
            return
          }
          // Render free tier can cold-start slowly, especially on mobile networks.
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      }
      inFlight = false
    }

    checkBackendHealth(true)

    const intervalId = setInterval(() => {
      if (keepPolling) {
        checkBackendHealth()
      }
    }, 30000)

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
      const response = await fetchWithFallback('/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: trimmedQuery }),
      })

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
              <ResultCard key={`${result.text}-${index}`} result={result} apiBase={PRIMARY_API_BASE} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard

