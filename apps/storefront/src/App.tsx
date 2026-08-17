import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'

type ShopifyProduct = {
  id: string
  variantId?: string
  variants: ShopifyVariant[]
  options: ShopifyOption[]
  title: string
  description: string
  handle: string
  price: string
  currencyCode: string
  imageUrl: string
}

type ShopifyVariant = {
  id: string
  title: string
  price: string
  currencyCode: string
  selectedOptions: { name: string; value: string }[]
}

type ShopifyOption = {
  name: string
  values: string[]
}

type ShopifyCollection = {
  handle: string
  title: string
  products: ShopifyProduct[]
}

type StorefrontCatalog = {
  featured: ShopifyCollection
  collections: ShopifyCollection[]
}

const fallbackProducts: ShopifyProduct[] = [
  {
    id: 'fallback-1',
    title: 'Dice Vault Organizer',
    description: 'Modular storage with dedicated slots for dice, tokens, and small accessories.',
    handle: 'dice-vault-organizer',
    price: '29.99',
    currencyCode: 'USD',
    imageUrl: '/listings/Listing_D20_Storage.jpg',
    variants: [{ id: 'fallback-1-variant', title: 'Default', price: '29.99', currencyCode: 'USD', selectedOptions: [] }],
    options: [],
  },
  {
    id: 'fallback-2',
    title: 'Premium Card Storage Box',
    description: 'A durable card box designed to keep decks protected, sorted, and ready to travel.',
    handle: 'premium-card-storage-box',
    price: '42.00',
    currencyCode: 'USD',
    imageUrl: '/listings/Listing_PW_Box.JPG',
    variants: [{ id: 'fallback-2-variant', title: 'Default', price: '42.00', currencyCode: 'USD', selectedOptions: [] }],
    options: [],
  },
  {
    id: 'fallback-3',
    title: 'Dual Life Counter Set',
    description: 'Simple, clear life tracking for clean turns and less table clutter.',
    handle: 'dual-life-counter-set',
    price: '18.50',
    currencyCode: 'USD',
    imageUrl: '/listings/Listing_TCG_Generic.jpg',
    variants: [{ id: 'fallback-3-variant', title: 'Default', price: '18.50', currencyCode: 'USD', selectedOptions: [] }],
    options: [],
  },
]

function formatPrice(amount: string, currencyCode: string) {
  const numericAmount = Number(amount)

  if (Number.isNaN(numericAmount)) {
    return `${amount} ${currencyCode}`
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'USD',
  }).format(numericAmount)
}

const fallbackCatalog: StorefrontCatalog = {
  featured: {
    handle: 'featured',
    title: 'Featured gear',
    products: fallbackProducts,
  },
  collections: [
    { handle: 'storage', title: 'Storage', products: [fallbackProducts[0], fallbackProducts[1]] },
    { handle: 'table-tools', title: 'Table tools', products: [fallbackProducts[2]] },
  ],
}

async function fetchCatalog(): Promise<StorefrontCatalog> {
  const domain = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN || 'tcgbox.myshopify.com'
  const accessToken = import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN
  const apiVersion = import.meta.env.VITE_SHOPIFY_API_VERSION || '2026-01'

  if (!accessToken) {
    return fallbackCatalog
  }

  const response = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': accessToken,
    },
    body: JSON.stringify({
      query: `
        query {
          collections(first: 10) {
            nodes {
              handle
              title
              products(first: 8) {
                edges {
                  node {
                    id
                    title
                    description
                    handle
                    featuredImage { url altText }
                    options { name values }
                    variants(first: 100) {
                      nodes {
                        id
                        title
                        selectedOptions { name value }
                        price { amount currencyCode }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
    }),
  })

  if (!response.ok) {
    throw new Error(`Shopify request failed: ${response.status}`)
  }

  const data = await response.json()
  const collections = (data?.data?.collections?.nodes ?? []).map((collection: any) => ({
    handle: collection.handle,
    title: collection.title,
    products: (collection.products?.edges ?? []).map(({ node }: { node: any }) => {
      const firstVariant = node.variants?.nodes?.[0]
      const price = firstVariant?.price ?? { amount: '0.00', currencyCode: 'USD' }

      return {
        id: node.id,
        variantId: firstVariant?.id,
        variants: (node.variants?.nodes ?? []).map((variant: any) => ({
          id: variant.id,
          title: variant.title,
          price: variant.price.amount,
          currencyCode: variant.price.currencyCode,
          selectedOptions: variant.selectedOptions ?? [],
        })),
        options: node.options ?? [],
        title: node.title,
        description: node.description ?? 'Collector favorite from the tcgbox catalog.',
        handle: node.handle,
        price: price.amount,
        currencyCode: price.currencyCode,
        imageUrl: node.featuredImage?.url ?? fallbackProducts[0].imageUrl,
      }
    }),
  }))
  const featuredHandle = import.meta.env.VITE_SHOPIFY_FEATURED_COLLECTION_HANDLE || 'featured'
  const featured = collections.find((collection: ShopifyCollection) => collection.handle === featuredHandle) ?? collections[0]

  if (!featured) {
    return fallbackCatalog
  }

  return {
    featured,
    collections: collections.filter((collection: ShopifyCollection) => collection.handle !== featured.handle && collection.products.length > 0),
  }
}

function ProductCard({ product, compact = false, onAddToCart }: { product: ShopifyProduct; compact?: boolean; onAddToCart: (productId: string, variantId?: string) => void }) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const initialVariant = product.variants.find((variant) => variant.id === product.variantId) ?? product.variants[0]
    return Object.fromEntries(initialVariant?.selectedOptions.map((option) => [option.name, option.value]) ?? [])
  })
  const selectedVariant = product.variants.find((variant) =>
    product.options.every((option) => variant.selectedOptions.some((selectedOption) => selectedOption.name === option.name && selectedOption.value === selectedOptions[option.name])),
  )

  return (
    <article className={`product-card${compact ? ' product-card-compact' : ''}`}>
      <img src={product.imageUrl} alt={product.title} className="product-image" />
      <div className="product-copy">
        <span className="product-tag">Featured</span>
        <h3>{product.title}</h3>
        <p>{product.description}</p>
        {product.options.map((option) => (
          <label className="variant-select" key={option.name}>
            {option.name}
            <select
              value={selectedOptions[option.name] ?? option.values[0]}
              onChange={(event) => {
                setSelectedOptions((currentOptions) => ({
                  ...currentOptions,
                  [option.name]: event.target.value,
                }))
              }}
            >
              {option.values.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        ))}
        <div className="product-row">
          <strong>{selectedVariant ? formatPrice(selectedVariant.price, selectedVariant.currencyCode) : 'Unavailable'}</strong>
          <button type="button" disabled={!selectedVariant} onClick={() => selectedVariant && onAddToCart(product.id, selectedVariant.id)}>Add to cart</button>
        </div>
      </div>
    </article>
  )
}

function App() {
  const publicShopUrl = import.meta.env.VITE_SHOPIFY_PUBLIC_STORE_URL || 'https://shop.tcgbox.store'
  const [catalog, setCatalog] = useState<StorefrontCatalog>(fallbackCatalog)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeForm, setActiveForm] = useState<'support' | 'custom' | null>(null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [showThankYou, setShowThankYou] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    let active = true

    async function loadProducts() {
      try {
        const nextCatalog = await fetchCatalog()
        if (active) {
          setCatalog(nextCatalog)
          setError(null)
        }
      } catch (loadError) {
        if (active) {
          setCatalog(fallbackCatalog)
          setError('Live Shopify data is not available yet, so placeholder products are showing.')
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    loadProducts()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('dark-theme', isDarkMode)

    return () => {
      document.body.classList.remove('dark-theme')
    }
  }, [isDarkMode])

  const allProducts = Array.from(new Map(
    [catalog.featured, ...catalog.collections]
      .flatMap((collection) => collection.products)
      .map((product) => [product.id, product] as const),
  ).values())
  const productCountLabel = useMemo(() => `${allProducts.length} products available`, [allProducts.length])
    const cartItems = allProducts.flatMap((product) => Object.entries(cart)
      .filter(([cartKey]) => product.variants.some((variant) => variant.id === cartKey) || cartKey === product.id)
      .map(([cartKey, quantity]) => ({
        product,
        variant: product.variants.find((candidate) => candidate.id === cartKey),
        quantity,
        cartKey,
      })))
  const cartCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0)
    const cartTotal = cartItems.reduce((total, item) => total + Number(item.variant?.price ?? item.product.price) * item.quantity, 0)

  function addToCart(productId: string, variantId?: string) {
    const cartKey = variantId || productId
    setCart((currentCart) => ({
      ...currentCart,
      [cartKey]: (currentCart[cartKey] ?? 0) + 1,
    }))
    setCheckoutError(null)
    setIsCartOpen(true)
  }

  function updateCartQuantity(cartKey: string, quantity: number) {
    setCart((currentCart) => {
      const nextCart = { ...currentCart }
      if (quantity <= 0) {
        delete nextCart[cartKey]
      } else {
        nextCart[cartKey] = quantity
      }
      return nextCart
    })
  }

  async function handleCheckout() {
    const domain = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN
    const accessToken = import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN
    const apiVersion = import.meta.env.VITE_SHOPIFY_API_VERSION || '2026-01'

    if (!domain || !accessToken || cartItems.some(({ product, variant }) => !variant?.id && !product.variantId)) {
      setCheckoutError('Shopify checkout will be available when the live catalog is connected.')
      return
    }

    setIsCheckingOut(true)
    setCheckoutError(null)

    try {
      const response = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: `
            mutation CreateCart($lines: [CartLineInput!]) {
              cartCreate(input: { lines: $lines }) {
                cart { checkoutUrl }
                userErrors { message }
              }
            }
          `,
          variables: {
            lines: cartItems.map(({ product, variant, quantity }) => ({
              merchandiseId: variant?.id || product.variantId,
              quantity,
            })),
          },
        }),
      })
      const data = await response.json()
      const result = data?.data?.cartCreate
      const userError = result?.userErrors?.[0]?.message

      if (!response.ok || userError || !result?.cart?.checkoutUrl) {
        throw new Error(userError || 'Shopify checkout could not be created.')
      }

      window.location.href = result.cart.checkoutUrl
    } catch (checkoutLoadError) {
      setCheckoutError(checkoutLoadError instanceof Error ? checkoutLoadError.message : 'Shopify checkout could not be created.')
    } finally {
      setIsCheckingOut(false)
    }
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>, formName: 'support' | 'custom') {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const subject = formName === 'support' ? 'TCGBox support request' : 'TCGBox custom order request'
    const defaultFormEndpoint = 'https://formsubmit.co/ajax/orders@tcgbox.store'
    const formEndpoint = import.meta.env.VITE_FORMS_ENDPOINT || defaultFormEndpoint

    setFormStatus('sending')

    if (formEndpoint) {
      if (formEndpoint === defaultFormEndpoint) {
        const submission = new FormData()
        submission.append('_subject', subject)
        submission.append('_replyto', String(formData.get('email') || ''))
        submission.append('form', formName)
        formData.forEach((value, field) => submission.append(field, value))
        void fetch(formEndpoint, { method: 'POST', body: submission, mode: 'no-cors' }).catch(() => undefined)
        event.currentTarget.reset()
        setFormStatus('sent')
        setShowThankYou(true)
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' })
          window.location.reload()
        }, 1400)
        return
      }

      try {
        const response = await fetch(formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form: formName,
            subject,
            ...Object.fromEntries(formData.entries()),
          }),
        })
        if (!response.ok) throw new Error('Form submission failed.')
        event.currentTarget.reset()
        setFormStatus('sent')
        setTimeout(() => {
          setShowThankYou(true)
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'instant' })
            window.location.reload()
          }, 1400)
        }, 1200)
        return
      } catch {
        setFormStatus('error')
        return
      }
    }

    event.currentTarget.reset()
    setActiveForm(null)
    setFormStatus('idle')
    setShowThankYou(true)
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.location.reload()
    }, 1400)
  }

  return (
    <div id="top" className={`page-shell${isDarkMode ? ' dark-mode' : ''}`}>
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="Back to top">
          <img className="brand-logo" src="/header_logo.svg" alt="TCGBox" />
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#featured">Featured</a>
          <a href={publicShopUrl} target="_blank" rel="noreferrer">Shop</a>
        </nav>
        <button
          className="theme-toggle"
          type="button"
          onClick={() => setIsDarkMode((currentMode) => !currentMode)}
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={isDarkMode}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span aria-hidden="true">{isDarkMode ? '☀' : '☾'}</span>
        </button>
        <button className="cart-button" type="button" onClick={() => setIsCartOpen(true)}>
          Cart <span>{cartCount}</span>
        </button>
      </header>

      <main>
        <section className="hero" aria-label="Featured product banner">
          <div className="hero-banner">
            <div className="hero-banner-overlay">
              <h1>
                Built for the way
                <br />
                you play.
              </h1>
            </div>
          </div>
        </section>

        <section id="featured" className="products-section">
          <div className="section-heading product-header">
            <div>
              <h2>Gear for every table</h2>
            </div>
            <span className="product-count">{productCountLabel}</span>
          </div>

          {error ? <p className="product-status">{error}</p> : null}

          {isLoading ? (
            <p className="product-status">Loading Shopify products...</p>
          ) : (
            <>
              <section className="collection-section collection-section-featured" aria-labelledby="featured-collection-title">
                <div className="collection-heading">
                  <p className="eyebrow">Shop the collection</p>
                  <h3 id="featured-collection-title">{catalog.featured.title}</h3>
                </div>
                <div className="product-grid">
                  {catalog.featured.products.map((product) => <ProductCard key={product.id} product={product} onAddToCart={addToCart} />)}
                </div>
              </section>
              {catalog.collections.map((collection) => (
                <section className="collection-section" key={collection.handle} aria-labelledby={`${collection.handle}-title`}>
                  <div className="collection-heading">
                    <h3 id={`${collection.handle}-title`}>{collection.title}</h3>
                  </div>
                  <div className="product-grid product-grid-small">
                    {collection.products.map((product) => <ProductCard key={product.id} product={product} compact onAddToCart={addToCart} />)}
                  </div>
                </section>
              ))}
            </>
          )}
        </section>

      </main>

      {isCartOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsCartOpen(false)}>
          <aside className="cart-drawer" aria-label="Shopping cart" onClick={(event) => event.stopPropagation()}>
            <div className="form-modal-header">
              <div>
                <p className="eyebrow">Your setup</p>
                <h2>Shopping cart</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setIsCartOpen(false)}>Close</button>
            </div>
            {cartItems.length === 0 ? <p className="product-status">Your cart is empty.</p> : (
              <>
                <div className="cart-items">
                  {cartItems.map(({ product, variant, quantity, cartKey }) => (
                    <div className="cart-item" key={cartKey}>
                      <img src={product.imageUrl} alt="" />
                      <div>
                        <h3>{product.title}</h3>
                        {variant?.title && variant.title !== 'Default' ? <p className="cart-variant">{variant.title}</p> : null}
                        <strong>{formatPrice(variant?.price || product.price, variant?.currencyCode || product.currencyCode)}</strong>
                        <div className="quantity-controls">
                          <button type="button" onClick={() => updateCartQuantity(cartKey, quantity - 1)} aria-label={`Decrease ${product.title} quantity`}>-</button>
                          <span>{quantity}</span>
                          <button type="button" onClick={() => updateCartQuantity(cartKey, quantity + 1)} aria-label={`Increase ${product.title} quantity`}>+</button>
                          <button className="remove-button" type="button" onClick={() => updateCartQuantity(cartKey, 0)}>Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <span>Subtotal</span>
                  <strong>{formatPrice(cartTotal.toFixed(2), cartItems[0]?.variant?.currencyCode || cartItems[0]?.product.currencyCode || 'USD')}</strong>
                </div>
                <button className="primary-button cart-checkout" type="button" onClick={handleCheckout} disabled={isCheckingOut}>
                  {isCheckingOut ? 'Connecting to Shopify...' : 'Continue to checkout'}
                </button>
                {checkoutError ? <p className="product-status">{checkoutError}</p> : null}
              </>
            )}
          </aside>
        </div>
      ) : null}

      <footer id="contact" className="footer">
        <div className="about-copy">
          <p className="eyebrow">About TCGBox</p>
          <h2>Built for TCG players.</h2>
          <p>
            TCGBox creates 3D-printed accessories designed to make your cards easier to play,
            store, and organize. From deck boxes and bulk dividers to life counters and dice
            storage, every product is designed with real tabletop use in mind.
          </p>
          <strong>Designed. Printed. Built to play.</strong>
        </div>
        <div className="form-launchers">
          <button className="form-launch-button" type="button" onClick={() => setActiveForm('support')}>
            Support
          </button>
          <button className="form-launch-button" type="button" onClick={() => setActiveForm('custom')}>
            Custom order
          </button>
        </div>
        <div className="contact-details">
          <span>tcgbox.store</span>
          <a href="mailto:orders@tcgbox.store">orders@tcgbox.store</a>
        </div>
      </footer>

      {activeForm ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveForm(null)}>
          <div className="form-modal" role="dialog" aria-modal="true" aria-labelledby="form-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="form-modal-header">
              <div>
                <p className="eyebrow">{activeForm === 'support' ? 'Need a hand?' : 'Make it yours'}</p>
                <h2 id="form-modal-title">{activeForm === 'support' ? 'Support' : 'Custom order'}</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setActiveForm(null)} aria-label="Close form">
                Close
              </button>
            </div>
            <form className="contact-form" onSubmit={(event) => handleFormSubmit(event, activeForm)}>
              <label>
                Name
                <input name="name" type="text" autoComplete="name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" autoComplete="email" required />
              </label>
              {activeForm === 'support' ? (
                <label>
                  Order number (optional)
                  <input name="orderNumber" type="text" />
                </label>
              ) : (
                <>
                  <label>
                    Quantity
                    <input name="quantity" type="number" min="1" inputMode="numeric" required />
                  </label>
                  <label>
                    Needed by (optional)
                    <input name="deadline" type="date" />
                  </label>
                </>
              )}
              <label>
                {activeForm === 'support' ? 'How can we help?' : 'What are you looking for?'}
                <textarea name="message" rows={5} placeholder={activeForm === 'custom' ? 'Tell us about the product, colors, dimensions, or game.' : undefined} required />
              </label>
              <button className="primary-button" type="submit" disabled={formStatus === 'sending'}>
                {formStatus === 'sending' ? 'Sending...' : activeForm === 'support' ? 'Send support request' : 'Request a custom order'}
              </button>
              {formStatus === 'sent' ? <p className="form-success">Request sent. Thanks.</p> : null}
              {formStatus === 'error' ? <p className="form-error">Could not send. Please try again or email orders@tcgbox.store.</p> : null}
            </form>
          </div>
        </div>
      ) : null}

      {showThankYou ? (
        <div className="thank-you-backdrop" role="status" aria-live="polite">
          <div className="thank-you-message">
            <span className="thank-you-check" aria-hidden="true">✓</span>
            <p className="eyebrow">Message received</p>
            <h2>Thank you.</h2>
            <p>We&apos;ll be in touch soon.</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
