import React from 'react'
import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
import SolutionManager from './pages/SolutionManager'
import Header from './components/Header'
import Footer from './components/Footer'
import './App.css'

function App() {
  const [page, setPage] = useState('dashboard')
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark') {
      setTheme('dark')
      document.body.classList.add('dark')
    }
  }, [])

  const handleToggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    document.body.classList.toggle('dark', nextTheme === 'dark')
    localStorage.setItem('theme', nextTheme)
  }

  return (
    <div className="app-shell">
      <Header
        currentPage={page}
        onNavigate={setPage}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="content-container">
        <section className="content-card">
          {page === 'dashboard' ? <Dashboard /> : <SolutionManager />}
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default App

/*import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
import SolutionManager from './pages/SolutionManager'
import Header from './components/Header'
import Footer from './components/Footer'
import './App.css'

function App() {
  const [page, setPage] = useState('dashboard')
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark') {
      setTheme('dark')
      document.body.classList.add('dark')
    }
  }, [])

  const handleToggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    document.body.classList.toggle('dark', nextTheme === 'dark')
    localStorage.setItem('theme', nextTheme)
  }

  return (
    <div className="app-shell">
      <Header
        currentPage={page}
        onNavigate={setPage}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="content-container">
        <section className="content-card">
          {page === 'dashboard' ? <Dashboard /> : <SolutionManager />}
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default App

*/