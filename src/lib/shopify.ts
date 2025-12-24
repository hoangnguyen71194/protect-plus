import { createHmac } from "crypto";
import { Order } from "@/types/order";

interface ShopifyConfig {
  shop: string;
  accessToken: string;
}

let shopifyConfig: ShopifyConfig | null = null;

export function setShopifyConfig(config: ShopifyConfig) {
  shopifyConfig = config;
}

export function getShopifyConfig(): ShopifyConfig {
  if (!shopifyConfig) {
    const shop = process.env.SHOPIFY_SHOP;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shop || !accessToken) {
      throw new Error(
        "Shopify credentials not configured. Set SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN in .env.local"
      );
    }

    shopifyConfig = { shop, accessToken };
  }

  return shopifyConfig;
}

const ORDERS_QUERY = `
  query getOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          email
          createdAt
          updatedAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
            }
          }
          totalTaxSet {
            shopMoney {
              amount
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          shippingAddress {
            firstName
            lastName
            address1
            address2
            city
            province
            country
            zip
          }
          lineItems(first: 250) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                variant {
                  sku
                }
              }
            }
          }
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          customer {
            id
            email
            firstName
            lastName
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface GraphQLOrderNode {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  subtotalPriceSet: {
    shopMoney: {
      amount: string;
    };
  };
  totalTaxSet: {
    shopMoney: {
      amount: string;
    };
  };
  totalShippingPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  } | null;
  shippingAddress: {
    firstName: string | null;
    lastName: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
  } | null;
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        quantity: number;
        originalUnitPriceSet: {
          shopMoney: {
            amount: string;
          };
        };
        variant: {
          sku: string | null;
        } | null;
      };
    }>;
  };
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currencyCode: string;
  customer: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

function transformGraphQLOrderToOrder(graphQLOrder: GraphQLOrderNode): Order {
  const orderNumber = parseInt(graphQLOrder.name.replace("#", "")) || 0;

  return {
    id: graphQLOrder.id.replace("gid://shopify/Order/", ""),
    order_number: orderNumber,
    email: graphQLOrder.email || undefined,
    created_at: graphQLOrder.createdAt,
    updated_at: graphQLOrder.updatedAt,
    total_price: graphQLOrder.totalPriceSet.shopMoney.amount,
    subtotal_price: graphQLOrder.subtotalPriceSet.shopMoney.amount,
    total_tax: graphQLOrder.totalTaxSet.shopMoney.amount,
    total_shipping_price_set: graphQLOrder.totalShippingPriceSet
      ? {
          shop_money: {
            amount: graphQLOrder.totalShippingPriceSet.shopMoney.amount,
            currency_code:
              graphQLOrder.totalShippingPriceSet.shopMoney.currencyCode,
          },
        }
      : undefined,
    shipping_address: graphQLOrder.shippingAddress
      ? {
          first_name: graphQLOrder.shippingAddress.firstName || undefined,
          last_name: graphQLOrder.shippingAddress.lastName || undefined,
          address1: graphQLOrder.shippingAddress.address1 || undefined,
          address2: graphQLOrder.shippingAddress.address2 || undefined,
          city: graphQLOrder.shippingAddress.city || undefined,
          province: graphQLOrder.shippingAddress.province || undefined,
          country: graphQLOrder.shippingAddress.country || undefined,
          zip: graphQLOrder.shippingAddress.zip || undefined,
        }
      : undefined,
    line_items: graphQLOrder.lineItems.edges.map((edge) => ({
      id: edge.node.id.replace("gid://shopify/LineItem/", ""),
      title: edge.node.title,
      quantity: edge.node.quantity,
      price: edge.node.originalUnitPriceSet.shopMoney.amount,
      sku: edge.node.variant?.sku || undefined,
    })),
    financial_status: graphQLOrder.displayFinancialStatus || undefined,
    fulfillment_status: graphQLOrder.displayFulfillmentStatus || undefined,
    currency: graphQLOrder.currencyCode,
    customer: graphQLOrder.customer
      ? {
          id: graphQLOrder.customer.id.replace("gid://shopify/Customer/", ""),
          email: graphQLOrder.customer.email || undefined,
          first_name: graphQLOrder.customer.firstName || undefined,
          last_name: graphQLOrder.customer.lastName || undefined,
        }
      : undefined,
  };
}

const BULK_OPERATION_QUERY = `
  mutation bulkOperationRunQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const BULK_OPERATION_STATUS_QUERY = `
  query getBulkOperationStatus($id: ID!) {
    node(id: $id) {
      ... on BulkOperation {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
    }
  }
`;

const CURRENT_BULK_OPERATION_QUERY = `
  query currentBulkOperation {
    currentBulkOperation {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }
`;

const SINGLE_ORDER_QUERY = `
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      createdAt
      updatedAt
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      subtotalPriceSet {
        shopMoney {
          amount
        }
      }
      totalTaxSet {
        shopMoney {
          amount
        }
      }
      totalShippingPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      shippingAddress {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
      }
      lineItems(first: 250) {
        edges {
          node {
            id
            title
            quantity
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
            variant {
              sku
            }
          }
        }
      }
      displayFinancialStatus
      displayFulfillmentStatus
      currencyCode
      customer {
        id
        email
        firstName
        lastName
      }
    }
  }
`;

interface BulkOperationResponse {
  bulkOperation: {
    id: string;
    status: string;
    errorCode?: string;
    createdAt: string;
    completedAt?: string;
    objectCount?: string;
    fileSize?: string;
    url?: string;
    partialDataUrl?: string;
  };
  userErrors: Array<{ field: string[]; message: string }>;
}

async function executeGraphQLQuery(
  query: string,
  variables?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const config = getShopifyConfig();
  const graphqlUrl = `https://${config.shop}.myshopify.com/admin/api/2025-10/graphql.json`;

  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

async function pollBulkOperationStatus(
  operationId: string,
  maxWaitTime = 7200000 // 2 hours
): Promise<string> {
  const startTime = Date.now();
  const pollInterval = 60000; // Poll every 60 seconds

  while (Date.now() - startTime < maxWaitTime) {
    const data = (await executeGraphQLQuery(BULK_OPERATION_STATUS_QUERY, {
      id: operationId,
    })) as {
      node: BulkOperationResponse["bulkOperation"];
    };

    const operation = data.node;

    if (operation.status === "COMPLETED") {
      if (!operation.url) {
        throw new Error("Bulk operation completed but no URL provided");
      }
      return operation.url;
    }

    if (operation.status === "FAILED") {
      throw new Error(
        `Bulk operation failed: ${operation.errorCode || "Unknown error"}`
      );
    }

    if (operation.status === "CANCELED") {
      throw new Error("Bulk operation was canceled");
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Bulk operation timeout - operation took too long");
}

export async function downloadBulkData(url: string): Promise<Order[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download bulk data: ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.trim().split("\n");
  const orders: Order[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const orderData = JSON.parse(line) as BulkOrderData;
      // Bulk operations return data in a different format
      // We need to transform it to our Order format
      if (orderData.__typename === "Order") {
        const order = transformBulkOrderToOrder(orderData);
        orders.push(order);
      }
    } catch (error) {
      console.error("Error parsing bulk data line:", error, line);
    }
  }

  return orders;
}

interface BulkOrderData {
  id?: string;
  name?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  totalPriceSet?: {
    shopMoney?: {
      amount?: string;
      currencyCode?: string;
    };
  };
  subtotalPriceSet?: {
    shopMoney?: {
      amount?: string;
    };
  };
  totalTaxSet?: {
    shopMoney?: {
      amount?: string;
    };
  };
  totalShippingPriceSet?: {
    shopMoney?: {
      amount?: string;
      currencyCode?: string;
    };
  };
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
  };
  lineItems?: {
    edges?: Array<{
      node?: {
        id?: string;
        title?: string;
        quantity?: number;
        originalUnitPriceSet?: {
          shopMoney?: {
            amount?: string;
          };
        };
        variant?: {
          sku?: string;
        };
      };
    }>;
  };
  displayFinancialStatus?: string;
  displayFulfillmentStatus?: string;
  currencyCode?: string;
  customer?: {
    id?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  __typename?: string;
}

function transformBulkOrderToOrder(bulkOrder: BulkOrderData): Order {
  // Transform bulk operation order format to our Order format
  const orderNumber = parseInt(bulkOrder.name?.replace("#", "") || "0");

  return {
    id: bulkOrder.id?.replace("gid://shopify/Order/", "") || "",
    order_number: orderNumber,
    email: bulkOrder.email || undefined,
    created_at: bulkOrder.createdAt || new Date().toISOString(),
    updated_at: bulkOrder.updatedAt || new Date().toISOString(),
    total_price: bulkOrder.totalPriceSet?.shopMoney?.amount || "0",
    subtotal_price: bulkOrder.subtotalPriceSet?.shopMoney?.amount || "0",
    total_tax: bulkOrder.totalTaxSet?.shopMoney?.amount || "0",
    total_shipping_price_set: bulkOrder.totalShippingPriceSet
      ? {
          shop_money: {
            amount: bulkOrder.totalShippingPriceSet.shopMoney?.amount || "0",
            currency_code:
              bulkOrder.totalShippingPriceSet.shopMoney?.currencyCode || "USD",
          },
        }
      : undefined,
    shipping_address: bulkOrder.shippingAddress
      ? {
          first_name: bulkOrder.shippingAddress.firstName || undefined,
          last_name: bulkOrder.shippingAddress.lastName || undefined,
          address1: bulkOrder.shippingAddress.address1 || undefined,
          address2: bulkOrder.shippingAddress.address2 || undefined,
          city: bulkOrder.shippingAddress.city || undefined,
          province: bulkOrder.shippingAddress.province || undefined,
          country: bulkOrder.shippingAddress.country || undefined,
          zip: bulkOrder.shippingAddress.zip || undefined,
        }
      : undefined,
    line_items:
      bulkOrder.lineItems?.edges?.map((edge) => {
        const item = edge.node || {};
        return {
          id: item.id?.replace("gid://shopify/LineItem/", "") || "",
          title: item.title || "",
          quantity: item.quantity || 0,
          price: item.originalUnitPriceSet?.shopMoney?.amount || "0",
          sku: item.variant?.sku || undefined,
        };
      }) || [],
    financial_status: bulkOrder.displayFinancialStatus || undefined,
    fulfillment_status: bulkOrder.displayFulfillmentStatus || undefined,
    currency: bulkOrder.currencyCode || "USD",
    customer: bulkOrder.customer
      ? {
          id:
            bulkOrder.customer.id?.replace("gid://shopify/Customer/", "") || "",
          email: bulkOrder.customer.email || undefined,
          first_name: bulkOrder.customer.firstName || undefined,
          last_name: bulkOrder.customer.lastName || undefined,
        }
      : undefined,
  };
}

export async function syncOrdersBulk(sinceDate?: string): Promise<Order[]> {
  // Bulk operations require traversing connections via edges -> node
  let bulkQuery = `
    {
      orders`;

  if (sinceDate) {
    bulkQuery += `(query: "updated_at:>='${sinceDate}'")`;
  }

  bulkQuery += ` {
        edges {
          node {
            __typename
            id
            name
            email
            createdAt
            updatedAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            subtotalPriceSet {
              shopMoney {
                amount
              }
            }
            totalTaxSet {
              shopMoney {
                amount
              }
            }
            totalShippingPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              country
              zip
            }
            lineItems {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                  variant {
                    sku
                  }
                }
              }
            }
            displayFinancialStatus
            displayFulfillmentStatus
            currencyCode
            customer {
              id
              email
              firstName
              lastName
            }
          }
        }
      }
    }
  `;

  // Start bulk operation
  const bulkData = (await executeGraphQLQuery(BULK_OPERATION_QUERY, {
    query: bulkQuery,
  })) as {
    bulkOperationRunQuery: BulkOperationResponse;
  };

  const bulkOperation = bulkData.bulkOperationRunQuery.bulkOperation;

  if (bulkData.bulkOperationRunQuery.userErrors?.length > 0) {
    throw new Error(
      `Bulk operation errors: ${JSON.stringify(
        bulkData.bulkOperationRunQuery.userErrors
      )}`
    );
  }

  // Poll for completion
  const downloadUrl = await pollBulkOperationStatus(bulkOperation.id);

  // Download and parse the data
  const orders = await downloadBulkData(downloadUrl);

  return orders;
}

/**
 * Count orders updated after a specific date
 * Returns the count, but stops early if it exceeds the threshold
 */
export async function countOrdersSinceDate(
  sinceDate: string,
  threshold: number = 100
): Promise<number> {
  // We don't need exact count - we just need to know if it's above threshold
  // Fetch orders in batches until we exceed threshold or run out
  let count = 0;
  let hasNextPage = true;
  let cursor: string | undefined = undefined;

  while (hasNextPage && count < threshold) {
    const result = await fetchOrdersFromShopify(250, cursor, sinceDate);
    count += result.orders.length;
    hasNextPage = result.hasNextPage;
    cursor = result.endCursor || undefined;

    // If we've exceeded threshold, we can stop early
    if (count >= threshold) {
      return count; // Return at least threshold
    }
  }

  return count;
}

export interface BulkOperationStatus {
  id: string;
  status: string;
  errorCode?: string;
  url?: string;
  objectCount?: string;
  createdAt?: string;
  completedAt?: string;
}

/**
 * Get current bulk operation status (if any)
 */
export async function getCurrentBulkOperation(): Promise<BulkOperationStatus | null> {
  const data = (await executeGraphQLQuery(CURRENT_BULK_OPERATION_QUERY)) as {
    currentBulkOperation: BulkOperationStatus | null;
  };

  if (!data.currentBulkOperation) {
    return null;
  }

  return data.currentBulkOperation;
}

/**
 * Start a bulk orders operation and return its operation ID
 */
export async function startOrdersBulk(
  sinceDate?: string
): Promise<{ operationId: string }> {
  // Build bulk query (edges -> node)
  let bulkQuery = `
    {
      orders`;

  if (sinceDate) {
    bulkQuery += `(query: "updated_at:>='${sinceDate}'")`;
  }

  bulkQuery += ` {
        edges {
          node {
            __typename
            id
            name
            email
            createdAt
            updatedAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            subtotalPriceSet {
              shopMoney {
                amount
              }
            }
            totalTaxSet {
              shopMoney {
                amount
              }
            }
            totalShippingPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              country
              zip
            }
            lineItems {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                  variant {
                    sku
                  }
                }
              }
            }
            displayFinancialStatus
            displayFulfillmentStatus
            currencyCode
            customer {
              id
              email
              firstName
              lastName
            }
          }
        }
      }
    }
  `;

  const bulkData = (await executeGraphQLQuery(BULK_OPERATION_QUERY, {
    query: bulkQuery,
  })) as {
    bulkOperationRunQuery: BulkOperationResponse;
  };

  if (bulkData.bulkOperationRunQuery.userErrors?.length > 0) {
    throw new Error(
      `Bulk operation errors: ${JSON.stringify(
        bulkData.bulkOperationRunQuery.userErrors
      )}`
    );
  }

  const operationId = bulkData.bulkOperationRunQuery.bulkOperation.id;
  return { operationId };
}

/**
 * Fetch orders incrementally updated since a specific date
 */
export async function fetchOrdersIncremental(
  sinceDate: string
): Promise<Order[]> {
  const allOrders: Order[] = [];
  let hasNextPage = true;
  let cursor: string | undefined = undefined;

  while (hasNextPage) {
    const result = await fetchOrdersFromShopify(250, cursor, sinceDate);
    allOrders.push(...result.orders);
    hasNextPage = result.hasNextPage;
    cursor = result.endCursor || undefined;

    // Safety limit
    if (allOrders.length >= 10000) {
      break;
    }
  }

  return allOrders;
}

/**
 * Fetch multiple orders by their IDs from Shopify
 */
export async function fetchOrdersByIds(orderIds: string[]): Promise<Order[]> {
  const orders: Order[] = [];

  // Fetch orders in parallel (but limit concurrency to avoid rate limits)
  const batchSize = 10;
  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const batchPromises = batch.map((id) =>
      fetchOrderById(id).catch((error) => {
        console.error(`Error fetching order ${id}:`, error);
        return null;
      })
    );

    const batchResults = await Promise.all(batchPromises);
    const validOrders = batchResults.filter(
      (order): order is Order => order !== null
    );
    orders.push(...validOrders);
  }

  return orders;
}

/**
 * Verify webhook signature from Shopify
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(body, "utf8");
  const calculatedSignature = hmac.digest("base64");
  return calculatedSignature === signature;
}

interface WebhookLineItem {
  id?: number | string;
  title?: string;
  quantity?: number;
  price?: string;
  sku?: string;
}

interface WebhookShippingAddress {
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
}

interface WebhookCustomer {
  id?: number | string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface WebhookShippingPriceSet {
  shop_money?: {
    amount?: string;
    currency_code?: string;
  };
}

interface WebhookOrder {
  id?: number | string;
  name?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
  total_price?: string;
  subtotal_price?: string;
  total_tax?: string;
  total_shipping_price_set?: WebhookShippingPriceSet;
  shipping_address?: WebhookShippingAddress;
  line_items?: WebhookLineItem[];
  financial_status?: string;
  fulfillment_status?: string;
  currency?: string;
  customer?: WebhookCustomer;
}

/**
 * Fetch a single order from Shopify by ID
 */
export async function fetchOrderById(orderId: string): Promise<Order> {
  const shopifyOrderId = `gid://shopify/Order/${orderId}`;
  const data = (await executeGraphQLQuery(SINGLE_ORDER_QUERY, {
    id: shopifyOrderId,
  })) as {
    order: GraphQLOrderNode | null;
  };

  if (!data.order) {
    throw new Error(`Order ${orderId} not found in Shopify`);
  }

  return transformGraphQLOrderToOrder(data.order);
}

/**
 * Transform Shopify REST API order format (from webhooks) to our Order type
 */
export function transformWebhookOrderToOrder(
  webhookOrder: WebhookOrder
): Order {
  const orderNumber = parseInt(webhookOrder.name?.replace("#", "") || "0") || 0;

  return {
    id: webhookOrder.id?.toString() || "",
    order_number: orderNumber,
    email: webhookOrder.email || undefined,
    created_at: webhookOrder.created_at || new Date().toISOString(),
    updated_at: webhookOrder.updated_at || new Date().toISOString(),
    total_price: webhookOrder.total_price || "0",
    subtotal_price: webhookOrder.subtotal_price || "0",
    total_tax: webhookOrder.total_tax || "0",
    total_shipping_price_set: webhookOrder.total_shipping_price_set
      ? {
          shop_money: {
            amount:
              webhookOrder.total_shipping_price_set.shop_money?.amount || "0",
            currency_code:
              webhookOrder.total_shipping_price_set.shop_money?.currency_code ||
              "USD",
          },
        }
      : undefined,
    shipping_address: webhookOrder.shipping_address
      ? {
          first_name: webhookOrder.shipping_address.first_name || undefined,
          last_name: webhookOrder.shipping_address.last_name || undefined,
          address1: webhookOrder.shipping_address.address1 || undefined,
          address2: webhookOrder.shipping_address.address2 || undefined,
          city: webhookOrder.shipping_address.city || undefined,
          province: webhookOrder.shipping_address.province || undefined,
          country: webhookOrder.shipping_address.country || undefined,
          zip: webhookOrder.shipping_address.zip || undefined,
        }
      : undefined,
    line_items:
      webhookOrder.line_items?.map((item: WebhookLineItem) => ({
        id: item.id?.toString() || "",
        title: item.title || "",
        quantity: item.quantity || 0,
        price: item.price || "0",
        sku: item.sku || undefined,
      })) || [],
    financial_status: webhookOrder.financial_status || undefined,
    fulfillment_status: webhookOrder.fulfillment_status || undefined,
    currency: webhookOrder.currency || "USD",
    customer: webhookOrder.customer
      ? {
          id: webhookOrder.customer.id?.toString() || "",
          email: webhookOrder.customer.email || undefined,
          first_name: webhookOrder.customer.first_name || undefined,
          last_name: webhookOrder.customer.last_name || undefined,
        }
      : undefined,
  };
}

// Keep the old function for backward compatibility or small fetches
export async function fetchOrdersFromShopify(
  limit = 250,
  after?: string | undefined,
  sinceDate?: string
): Promise<{
  orders: Order[];
  hasNextPage: boolean;
  endCursor: string | null;
}> {
  const config = getShopifyConfig();
  const graphqlUrl = `https://${config.shop}.myshopify.com/admin/api/2025-10/graphql.json`;

  const variables: {
    first: number;
    after?: string;
    query?: string;
  } = {
    first: Math.min(limit, 250),
  };

  if (after) {
    variables.after = after;
  }

  if (sinceDate) {
    // Shopify query syntax: updated_at:>='2024-01-01T00:00:00Z' to get orders updated since date
    variables.query = `updated_at:>='${sinceDate}'`;
  }

  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: ORDERS_QUERY,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  const edges = data.data?.orders?.edges || [];
  const pageInfo = data.data?.orders?.pageInfo || {
    hasNextPage: false,
    endCursor: null,
  };

  const orders = edges.map((edge: { node: GraphQLOrderNode }) =>
    transformGraphQLOrderToOrder(edge.node)
  );

  return {
    orders,
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
}
