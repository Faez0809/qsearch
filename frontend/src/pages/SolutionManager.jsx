import SolutionForm from '../components/SolutionForm'
import SolutionList from '../components/SolutionList'

function SolutionManager() {
  return (
    <div className="page-content">
      <div className="info-card">
        <SolutionForm />
      </div>
      <div className="info-card">
        <SolutionList />
      </div>
    </div>
  )
}

export default SolutionManager
