function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-grid">
        <section className="footer-column">
          <h2 className="footer-title">About</h2>
          <p className="footer-text">QSearch helps teams find question-and-answer matches quickly.</p>
          <p className="footer-text">Credits: Product & Engineering Team.</p>
        </section>

        <section className="footer-column">
          <h2 className="footer-title">Navigation</h2>
          <ul className="footer-links">
            <li>
              <a href="#" className="footer-link">Dashboard</a>
            </li>
            <li>
              <a href="#" className="footer-link">Solution Manager</a>
            </li>
            <li>
              <a href="#" className="footer-link">Documentation</a>
            </li>
          </ul>
        </section>

        <section className="footer-column">
          <h2 className="footer-title">Contact</h2>
          <ul className="footer-links">
            <li>
              <a href="#" className="footer-link">support@qsearch.app</a>
            </li>
            <li>
              <a href="#" className="footer-link">Status Page</a>
            </li>
            <li>
              <a href="#" className="footer-link">Community</a>
            </li>
          </ul>
        </section>
      </div>
    </footer>
  )
}

export default Footer
