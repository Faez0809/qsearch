import { useEffect, useRef, useState } from 'react'
import SearchBox from '../components/SearchBox'
import ResultCard from '../components/ResultCard'

const mockResults = [
  {
    id: 'result-1',
    question: 'Find the derivative of f(x) = x^3 + 4x with step-by-step explanation.',
    match: 96,
  },
  {
    id: 'result-2',
    question: 'Which theorem helps prove triangle congruency with two sides and included angle?',
    match: 89,
  },
  {
    id: 'result-3',
    question: 'Summarize the causes and effects of the Industrial Revolution in Europe.',
    match: 84,
  },
]

function Dashboard() {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [results, setResults] = useState([])
  const [backendStatus, setBackendStatus] = useState('checking')
  const loadingTimeoutRef = useRef(null)

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

      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [])

  const handleSearch = () => {
    if (!query.trim()) {
      setValidationMessage('Please enter a question before searching.')
      setResults([])
      return
    }

    setValidationMessage('')
    setIsLoading(true)
    setResults([])

    loadingTimeoutRef.current = setTimeout(() => {
      setResults(mockResults)
      setIsLoading(false)
    }, 1200)
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
        ) : null}

        {!isLoading && results.length > 0 ? (
          <div className="results-stack results-stack-animated">
            {results.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default Dashboard
