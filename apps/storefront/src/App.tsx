import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'

type ShopifyProduct = {
  id: string
  variantId?: string
  title: string
  description: string
  handle: string
  price: string
  currencyCode: string
  imageUrl: string
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
  },
  {
    id: 'fallback-2',
    title: 'Premium Card Storage Box',
    description: 'A durable card box designed to keep decks protected, sorted, and ready to travel.',
    handle: 'premium-card-storage-box',
    price: '42.00',
    currencyCode: 'USD',
    imageUrl: '/listings/Listing_PW_Box.JPG',
  },
  {
    id: 'fallback-3',
    title: 'Dual Life Counter Set',
    description: 'Simple, clear life tracking for clean turns and less table clutter.',
    handle: 'dual-life-counter-set',
    price: '18.50',
    currencyCode: 'USD',
    imageUrl: '/listings/Listing_TCG_Generic.jpg',
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
                    variants(first: 1) {
                      nodes {
                        id
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

function ProductCard({ product, compact = false, onAddToCart }: { product: ShopifyProduct; compact?: boolean; onAddToCart: (productId: string) => void }) {
  return (
    <article className={`product-card${compact ? ' product-card-compact' : ''}`}>
      <img src={product.imageUrl} alt={product.title} className="product-image" />
      <div className="product-copy">
        <span className="product-tag">Featured</span>
        <h3>{product.title}</h3>
        <p>{product.description}</p>
        <div className="product-row">
          <strong>{formatPrice(product.price, product.currencyCode)}</strong>
          <button type="button" onClick={() => onAddToCart(product.id)}>Add to cart</button>
        </div>
      </div>
    </article>
  )
}

function App() {
  const [catalog, setCatalog] = useState<StorefrontCatalog>(fallbackCatalog)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeForm, setActiveForm] = useState<'support' | 'custom' | null>(null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)

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

  const allProducts = Array.from(new Map(
    [catalog.featured, ...catalog.collections]
      .flatMap((collection) => collection.products)
      .map((product) => [product.id, product] as const),
  ).values())
  const productCountLabel = useMemo(() => `${allProducts.length} products available`, [allProducts.length])
  const cartItems = allProducts
    .filter((product) => cart[product.id])
    .map((product) => ({ product, quantity: cart[product.id] }))
  const cartCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0)
  const cartTotal = cartItems.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0)

  function addToCart(productId: string) {
    setCart((currentCart) => ({
      ...currentCart,
      [productId]: (currentCart[productId] ?? 0) + 1,
    }))
    setCheckoutError(null)
    setIsCartOpen(true)
  }

  function updateCartQuantity(productId: string, quantity: number) {
    setCart((currentCart) => {
      const nextCart = { ...currentCart }
      if (quantity <= 0) {
        delete nextCart[productId]
      } else {
        nextCart[productId] = quantity
      }
      return nextCart
    })
  }

  async function handleCheckout() {
    const domain = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN
    const accessToken = import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN
    const apiVersion = import.meta.env.VITE_SHOPIFY_API_VERSION || '2026-01'

    if (!domain || !accessToken || cartItems.some(({ product }) => !product.variantId)) {
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
            lines: cartItems.map(({ product, quantity }) => ({
              merchandiseId: product.variantId,
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

  function handleFormSubmit(event: FormEvent<HTMLFormElement>, formName: 'support' | 'custom') {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const subject = formName === 'support' ? 'TCGBox support request' : 'TCGBox custom order request'
    const body = Array.from(formData.entries())
      .map(([field, value]) => `${field}: ${value}`)
      .join('\n')

    event.currentTarget.reset()
    setActiveForm(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.location.href = `mailto:order@tcgbox.store?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="Brand mark">
          <img className="brand-logo" src="/header_logo.svg" alt="TCGBox" />
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#featured">Featured</a>
          <a href="#best-sellers">Shop</a>
          <a href="#contact">Contact</a>
        </nav>
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
                  {cartItems.map(({ product, quantity }) => (
                    <div className="cart-item" key={product.id}>
                      <img src={product.imageUrl} alt="" />
                      <div>
                        <h3>{product.title}</h3>
                        <strong>{formatPrice(product.price, product.currencyCode)}</strong>
                        <div className="quantity-controls">
                          <button type="button" onClick={() => updateCartQuantity(product.id, quantity - 1)} aria-label={`Decrease ${product.title} quantity`}>-</button>
                          <span>{quantity}</span>
                          <button type="button" onClick={() => updateCartQuantity(product.id, quantity + 1)} aria-label={`Increase ${product.title} quantity`}>+</button>
                          <button className="remove-button" type="button" onClick={() => updateCartQuantity(product.id, 0)}>Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <span>Subtotal</span>
                  <strong>{formatPrice(cartTotal.toFixed(2), cartItems[0]?.product.currencyCode || 'USD')}</strong>
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
          <a href="mailto:order@tcgbox.store">order@tcgbox.store</a>
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
              <label>
                {activeForm === 'support' ? 'How can we help?' : 'What are you looking for?'}
                <textarea name="message" rows={5} placeholder={activeForm === 'custom' ? 'Tell us about the cards, colors, or setup.' : undefined} required />
              </label>
              <button className="primary-button" type="submit">
                {activeForm === 'support' ? 'Send support request' : 'Request a custom order'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
