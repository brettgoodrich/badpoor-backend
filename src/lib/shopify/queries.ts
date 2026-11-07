/**
 * Read-only Admin GraphQL for API version 2026-10.
 *
 * Orders: https://shopify.dev/docs/api/admin-graphql/2026-10/queries/orders
 * Line item unfulfilledQuantity: https://shopify.dev/docs/api/admin-graphql/2026-10/objects/LineItem
 * Products and variants: https://shopify.dev/docs/api/admin-graphql/2026-10/queries/product
 *
 * Customer fields are intentionally omitted. read_orders + read_products is enough,
 * and the shop floor view does not need customer names.
 */

export const OPEN_ORDERS_QUERY = /* GraphQL */ `
  query OpenOrders($cursor: String) {
    orders(
      first: 50
      after: $cursor
      sortKey: CREATED_AT
      reverse: false
      query: "status:open AND (fulfillment_status:unfulfilled OR fulfillment_status:partial)"
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        createdAt
        displayFulfillmentStatus
        lineItems(first: 100) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            name
            sku
            quantity
            unfulfilledQuantity
            variantTitle
            variant {
              id
            }
          }
        }
      }
    }
  }
`;

export const ORDER_LINE_ITEMS_QUERY = /* GraphQL */ `
  query OrderLineItems($id: ID!, $cursor: String) {
    order(id: $id) {
      lineItems(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          name
          sku
          quantity
          unfulfilledQuantity
          variantTitle
          variant {
            id
          }
        }
      }
    }
  }
`;

export const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        variants(first: 100) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            sku
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

export const PRODUCT_VARIANTS_QUERY = /* GraphQL */ `
  query ProductVariants($id: ID!, $cursor: String) {
    product(id: $id) {
      variants(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          sku
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;
