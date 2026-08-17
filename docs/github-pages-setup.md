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
