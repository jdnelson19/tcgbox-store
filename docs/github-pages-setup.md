## Custom domain: tcgbox.store

The storefront includes a `CNAME` file for `tcgbox.store`. To publish it:

1. In GitHub, open `jdnelson19/tcgbox-store` and go to **Settings > Pages**.
2. Set **Source** to **GitHub Actions**.
3. Enter `tcgbox.store` under **Custom domain** and save it.
4. In Cloudflare DNS, point the root domain to GitHub Pages with these A records:

	- `@` -> `185.199.108.153`
	- `@` -> `185.199.109.153`
	- `@` -> `185.199.110.153`
	- `@` -> `185.199.111.153`

5. Add a CNAME record for `www` pointing to `jdnelson19.github.io`.
6. Keep the records **DNS only** while GitHub verifies the domain. After verification, enable **Enforce HTTPS** in GitHub Pages and optionally turn Cloudflare proxying back on.

The root domain can only serve one host. If `tcgbox.store` is currently routed to Shopify, move the root DNS records to GitHub Pages for this storefront, or use a separate subdomain such as `shop.tcgbox.store` for Shopify.

## Shopify storefront: shop.tcgbox.store

Use the Shopify subdomain for the commerce landing page and checkout:

1. In Shopify Admin, open **Settings > Domains**.
2. Choose **Connect existing domain** and enter `shop.tcgbox.store`.
3. In Cloudflare DNS, add or update this record:

	- `shop` -> CNAME -> `shops.myshopify.com`

4. Set the Cloudflare record to **DNS only** while Shopify verifies it.
5. Return to Shopify Domains and wait for the domain to show as connected and SSL-protected.
6. Set `shop.tcgbox.store` as Shopify's primary domain for the online store if you want Shopify links and checkout to use it.

Keep the existing GitHub Pages records for `tcgbox.store` and `www`. This gives the site a clear split:

- `tcgbox.store`: public brand landing page on GitHub Pages
- `shop.tcgbox.store`: Shopify storefront, product pages, and checkout

For the Storefront API, keep `VITE_SHOPIFY_STORE_DOMAIN` set to the shop's actual `.myshopify.com` domain unless Shopify confirms that the custom domain is supported as the API endpoint. The public storefront URL and API endpoint do not have to be the same.

For GitHub Pages production builds, add these repository settings under **Settings > Secrets and variables > Actions**:

- Secret `VITE_SHOPIFY_STORE_DOMAIN`: the actual Shopify `*.myshopify.com` domain
- Secret `VITE_SHOPIFY_STOREFRONT_TOKEN`: the public Storefront API token
- Variable `VITE_SHOPIFY_FEATURED_COLLECTION_HANDLE`: the featured collection handle, usually `featured`
- Variable `VITE_SHOPIFY_ALL_PRODUCTS_COLLECTION_HANDLE`: the all-products collection handle, usually `all-products`
- Variable `VITE_SHOPIFY_COLLECTION_ORDER`: comma-separated highlighted collection handles, for example `deck-boxes,dice-storage,life-counters`
# GitHub Pages setup for tcgbox.store

This project is set up so the public storefront can be built as a static site and deployed to GitHub Pages.

## What this does

- Builds the Vite storefront app in `apps/storefront`
- Publishes the generated static files from `apps/storefront/dist`
- Deploys the output to the GitHub Pages environment

## Required GitHub settings

1. Push this repo to GitHub.
2. Open the repository on GitHub.
3. Go to Settings > Pages.
4. Set Source to `GitHub Actions`.
5. Ensure the default branch is `main` or update the workflow branch if needed.

## Shopify architecture recommendation

GitHub Pages is a good public frontend host, but it should not hold private Shopify credentials.

Use this pattern:

- Public site: GitHub Pages
- Commerce backend: Shopify Storefront API / Admin API
- Secrets: stored in GitHub repository secrets or a serverless backend
- Product data: loaded from Shopify, not hardcoded in the public repo

## Local verification

```bash
npm install
npm run build --workspace storefront
```

## Deploy trigger

The workflow runs automatically on pushes to `main` and can also be launched manually from the Actions tab.
