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
  return (
    <div className="dashboard-layout">
      <div className="dashboard-panel">
        <SearchBox />
      </div>

      <div className="dashboard-panel">
        <h2 className="section-title">Results</h2>
        <div className="results-stack">
          {mockResults.map((result) => (
            <ResultCard key={result.id} result={result} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
