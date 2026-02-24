import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import SolutionManager from './pages/SolutionManager'
import './App.css'

function App() {
  const [page, setPage] = useState('dashboard')

  return (
    <div className="app">
      <div>
        <button type="button" onClick={() => setPage('dashboard')}>
          Dashboard
        </button>
        <button type="button" onClick={() => setPage('solution-manager')}>
          Solution Manager
        </button>
      </div>

      {page === 'dashboard' ? <Dashboard /> : <SolutionManager />}
    </div>
  )
}

export default App
