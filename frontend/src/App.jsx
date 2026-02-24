import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import SolutionManager from './pages/SolutionManager'
import './App.css'

function App() {
  const [page, setPage] = useState('dashboard')

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <h1 className="app-title">QSearch</h1>
        <div className="nav-actions">
          <button
            type="button"
            className={`nav-button ${page === 'dashboard' ? 'active' : ''}`}
            onClick={() => setPage('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`nav-button ${page === 'solution-manager' ? 'active' : ''}`}
            onClick={() => setPage('solution-manager')}
          >
            Solution Manager
          </button>
        </div>
      </nav>

      <main className="content-container">
        <section className="content-card">
          {page === 'dashboard' ? <Dashboard /> : <SolutionManager />}
        </section>
      </main>
    </div>
  )
}

export default App
