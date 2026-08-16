# Shopify storefront integration

This storefront is prepared to pull product data from Shopify using the Storefront API.

## Required environment variables

Create a local environment file at `apps/storefront/.env` using the values from your Shopify store:

```bash
VITE_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
VITE_SHOPIFY_STOREFRONT_TOKEN=your_storefront_access_token
```

## How to get the values

1. Log in to Shopify Admin.
2. Go to Settings > Apps and sales channels > Develop apps.
3. Create a custom app or use an existing one.
4. Enable Storefront API access.
5. Copy the Storefront access token.
6. Use your store domain like `your-store.myshopify.com`.

## Notes

- This project uses a public storefront token pattern and assumes product data can be read from the storefront API.
- If no token is configured, the app gracefully falls back to placeholder products so the site still renders.
- For production GitHub Pages deployments, push the env values into the GitHub repo secrets or deployment environment used by the workflow.

## Example GraphQL query used

```graphql
query {
  products(first: 10) {
    edges {
      node {
        id
        title
        description
        handle
        featuredImage {
          url
        }
        variants(first: 10) {
          nodes {
            price {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
}
```
