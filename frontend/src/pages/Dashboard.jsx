import SearchBox from '../components/SearchBox'
import ResultCard from '../components/ResultCard'

function Dashboard() {
  return (
    <div className="page-content">
      <div className="info-card">
        <SearchBox />
      </div>
      <div className="info-card">
        <ResultCard />
      </div>
    </div>
  )
}

export default Dashboard
