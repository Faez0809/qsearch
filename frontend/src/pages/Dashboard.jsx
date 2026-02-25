import { useEffect, useState } from 'react'
import SearchBox from '../components/SearchBox'
import SolutionList from '../components/SolutionList'

function Dashboard() {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [results, setResults] = useState([])
  const [backendStatus, setBackendStatus] = useState('checking')

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
      const response = await fetch('http://127.0.0.1:8000/search', {
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
      setResults(data)
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
            ? 'Checking backend connection...'
            : backendStatus === 'connected'
              ? 'Backend Connected ✅'
              : 'Backend Offline ❌'}
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
        ) : (
          <div className="results-stack">
            <SolutionList solutions={results} />
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
