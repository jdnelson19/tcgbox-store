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
