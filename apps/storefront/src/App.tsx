import './App.css'

const benefits = [
  'Collector-grade product pages',
  'Fast mobile-first shopping',
  'Shopify-powered commerce backend',
  'GitHub Pages friendly deployment',
]

const categories = [
  { name: 'Singles', label: 'Pokémon, Magic, and sports cards' },
  { name: 'Sealed Product', label: 'Booster boxes, bundles, and case hits' },
  { name: 'Accessories', label: 'Binders, sleeves, and storage essentials' },
  { name: 'Collectors', label: 'Vault storage and premium organization' },
]

const stats = [
  { value: '24/7', label: 'storefront access' },
  { value: 'Shopify', label: 'commerce layer' },
  { value: 'GitHub', label: 'content and ops workflow' },
  { value: 'tcg.box', label: 'brand destination' },
]

function App() {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">TCG</span>
          <span className="brand-name">tcgbox.store</span>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#featured">Featured</a>
          <a href="#categories">Categories</a>
          <a href="#shopify">Shopify</a>
          <a href="#contact">Contact</a>
        </nav>
        <a className="nav-cta" href="https://tcg.box" target="_blank" rel="noreferrer">
          Shop tcg.box
        </a>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Trading cards. Stored smart.</p>
            <h1>Built for collectors who want their inventory visible and ready to buy.</h1>
            <p className="lede">
              tcgbox.store is the front door for a modern card business, while Shopify handles
              the physical commerce stack and tcg.box becomes the storefront brand customers know.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#featured">
                Explore collection
              </a>
              <a className="secondary-button" href="#shopify">
                See the stack
              </a>
            </div>
            <ul className="benefit-list" aria-label="Key benefits">
              {benefits.map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          </div>

          <div className="hero-panel" aria-label="Store summary">
            <div className="panel-card highlight">
              <span className="panel-label">Current focus</span>
              <strong>Premium TCG inventory</strong>
              <p>Singles, sealed products, and storage essentials for fast-moving collectors.</p>
            </div>
            <div className="panel-card">
              <span className="panel-label">Commerce model</span>
              <strong>Shopify + GitHub Pages</strong>
              <p>Fast static storefront + robust product commerce layer.</p>
            </div>
          </div>
        </section>

        <section className="stats" aria-label="Store metrics">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </section>

        <section id="featured" className="section-block">
          <div className="section-heading">
            <p className="eyebrow">Featured categories</p>
            <h2>Everything a collector needs in one place.</h2>
          </div>

          <div id="categories" className="category-grid">
            {categories.map((category) => (
              <article className="category-card" key={category.name}>
                <span className="category-tag">{category.name}</span>
                <h3>{category.name}</h3>
                <p>{category.label}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="shopify" className="stack-section">
          <div className="section-heading">
            <p className="eyebrow">Technical direction</p>
            <h2>Shopify handles the purchase flow. This site presents the brand.</h2>
          </div>

          <div className="stack-grid">
            <div className="stack-card">
              <h3>Brand experience</h3>
              <p>
                tcgbox.store will be the content, marketing, and collection entry point for the
                business. It can host landing pages, FAQ content, and collection storytelling.
              </p>
            </div>
            <div className="stack-card">
              <h3>Commerce backbone</h3>
              <p>
                Shopify Admin API and Storefront API can power product data, checkout, inventory,
                and fulfillment while keeping the front-end fast and lightweight.
              </p>
            </div>
            <div className="stack-card">
              <h3>Ops workflow</h3>
              <p>
                GitHub Pages is a strong fit for the public website, with content updates handled in
                Git and deployment triggered through GitHub Actions.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer id="contact" className="footer">
        <p>tcgbox.store</p>
        <a href="mailto:hello@tcgbox.store">hello@tcgbox.store</a>
      </footer>
    </div>
  )
}

export default App
