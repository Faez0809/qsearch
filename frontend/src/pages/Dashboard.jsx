import React from 'react'
import { useEffect, useRef, useState } from 'react'
import SearchBox from '../components/SearchBox'
import ResultCard from '../components/ResultCard'

const API_BASE = import.meta.env.PROD
  ? 'https://qsearch-9ejl.onrender.com'
  : 'http://127.0.0.1:8000'
const buildUrl = (path) => `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
const SEARCH_CACHE_KEY = 'qsearch_search_cache_v2'
const SEARCH_CACHE_LIMIT = 150

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchWithRetry = async (path, options = {}, retries = 2, waitMs = 900, timeoutMs = 12000) => {
  const requestOptions = { ...options }
  let lastResponse = null

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    let timeoutId
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      const response = await fetch(buildUrl(path), { ...requestOptions, signal: controller.signal })
      clearTimeout(timeoutId)
      if (response.ok) {
        return response
      }
      lastResponse = response
      if (response.status < 500 && response.status !== 429) {
        return response
      }
    } catch {
      // Retry on transient network or cold-start issues.
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
    if (attempt < retries) {
      await sleep(waitMs)
    }
  }
  if (lastResponse) {
    return lastResponse
  }
  throw new Error('Backend request failed after retries')
}

const normalizeQueryKey = (query) => query.trim().toLowerCase()

function Dashboard() {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [results, setResults] = useState([])
  const [backendStatus, setBackendStatus] = useState('checking')
  const searchCacheRef = useRef(new Map())

  const persistSearchCache = () => {
    try {
      const records = Array.from(searchCacheRef.current.entries()).map(([key, value]) => ({
        key,
        value,
      }))
      localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(records.slice(-SEARCH_CACHE_LIMIT)))
    } catch {
      // Ignore storage issues and keep in-memory cache.
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEARCH_CACHE_KEY)
      if (raw) {
        const records = JSON.parse(raw)
        if (Array.isArray(records)) {
          for (const record of records) {
            if (
              record &&
              typeof record.key === 'string' &&
              Array.isArray(record.value)
            ) {
              searchCacheRef.current.set(record.key, record.value)
            }
          }
        }
      }
    } catch {
      // Ignore bad cache payloads.
    }
  }, [])

  useEffect(() => {
    let keepPolling = true

    const checkBackendHealth = async (markChecking = false) => {
      if (markChecking) {
        setBackendStatus('checking')
      }

      try {
        const response = await fetchWithRetry(
          '/health',
          {},
          2,
          700,
          5000,
        )
        if (keepPolling && response.ok) {
          setBackendStatus('connected')
          // Start backend warmup in the background after health check.
          fetchWithRetry('/ready', {}, 1, 0, 5000).catch(() => {})
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
    }
  }, [])

  const handleSearch = async () => {
    const trimmedQuery = query.trim()
    const queryKey = normalizeQueryKey(trimmedQuery)

    if (!trimmedQuery) {
      setValidationMessage('Please enter a question before searching.')
      setResults([])
      return
    }

    setValidationMessage('')
    const cachedResults = searchCacheRef.current.get(queryKey)
    if (cachedResults) {
      setResults(cachedResults)
      setBackendStatus('connected')
      return
    }

    setIsLoading(true)

    try {
      const retries = backendStatus === 'connected' ? 2 : 4
      const waitMs = backendStatus === 'connected' ? 700 : 1500
      const response = await fetchWithRetry(
        `/search?query=${encodeURIComponent(trimmedQuery)}`,
        { method: 'GET' },
        retries,
        waitMs,
        15000,
      )

      if (!response.ok) {
        let detail = ''
        try {
          const payload = await response.json()
          detail = payload?.detail ? String(payload.detail) : ''
        } catch {
          detail = ''
        }
        setValidationMessage(detail || 'Unable to search right now. Please try again.')
        setResults([])
        return
      }

      const data = await response.json()
      setBackendStatus('connected')
      const normalizedResults = Array.isArray(data) ? data : []
      setResults(normalizedResults)
      searchCacheRef.current.set(queryKey, normalizedResults)
      if (searchCacheRef.current.size > SEARCH_CACHE_LIMIT) {
        const oldestKey = searchCacheRef.current.keys().next().value
        searchCacheRef.current.delete(oldestKey)
      }
      persistSearchCache()
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

