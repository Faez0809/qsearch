function Header({ currentPage, onNavigate, theme, onToggleTheme }) {
  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="app-logo">QSearch</h1>
      </div>

      <nav className="header-center" aria-label="Primary navigation">
        <button
          type="button"
          className={`nav-button ${currentPage === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`nav-button ${currentPage === 'solution-manager' ? 'active' : ''}`}
          onClick={() => onNavigate('solution-manager')}
        >
          Solution Manager
        </button>
      </nav>

      <div className="header-right">
        <button type="button" className="theme-toggle-button" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </header>
  )
}

export default Header
