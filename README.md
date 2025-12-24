# Protect+ Dashboard

A Shopify order analytics application built with Next.js, MongoDB, and Tailwind CSS.

## Features

- **Order Management**: View and manage orders from your Shopify store
- **Automatic Webhooks**: Automatically sync new orders via Shopify webhooks when orders are created
- **Manual Sync**: Sync orders from Shopify using bulk operations or incremental GraphQL queries
- **Analytics Dashboard**: View key metrics including order volume, revenue, and shipping costs
- **Pagination**: Flexible pagination with customizable page sizes (20, 50, 100)

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: MongoDB
- **Language**: TypeScript

## Prerequisites

- Node.js 18+ and pnpm
- MongoDB running locally (default: `mongodb://localhost:27017`)
- Shopify store with API access

## Setup Instructions

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/protect-plus

# Shopify Configuration
SHOPIFY_SHOP=your-shop-name
SHOPIFY_ACCESS_TOKEN=your-access-token
SHOPIFY_WEBHOOK_SECRET=your-webhook-secret
```

### 3. Start MongoDB

Make sure MongoDB is running locally:

```bash
# macOS (using Homebrew)
brew services start mongodb-community

# Or using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 4. Run the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Shopify Webhook Setup

To enable automatic order syncing when orders are created or updated in Shopify:

1. Go to your Shopify Admin → Settings → Notifications → Webhooks
2. Create webhooks for both events:
   
   **Order Creation Webhook:**
   - **Event**: Order creation
   - **Format**: JSON
   - **URL**: `https://your-domain.com/api/webhooks/orders`
   - **API version**: 2024-01
   
   **Order Update Webhook:**
   - **Event**: Order update
   - **Format**: JSON
   - **URL**: `https://your-domain.com/api/webhooks/orders/update`
   - **API version**: 2024-01
3. Copy the webhook secret (same for both) and add it to `.env.local` as `SHOPIFY_WEBHOOK_SECRET`

**Note**: For local development, use a tool like [ngrok](https://ngrok.com/) to expose your local server to the internet so Shopify can send webhooks to it.

## Manual Order Sync

You can manually sync orders from Shopify by calling:

```bash
POST /api/orders
Content-Type: application/json

{
  "sync": true
}
```

## API Endpoints

- `GET /api/orders?page=1&limit=20` - Get paginated orders list
- `POST /api/orders` - Sync orders from Shopify (uses bulk operations for large datasets, GraphQL for small updates)
- `GET /api/orders/[id]` - Get single order details
- `GET /api/metrics?days=30` - Get analytics metrics
- `GET /api/orders?status=bulk` - Check bulk sync status
- `POST /api/webhooks/orders` - Shopify webhook endpoint for order creation
- `POST /api/webhooks/orders/update` - Shopify webhook endpoint for order updates

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── orders/          # Order API routes
│   │   ├── metrics/         # Metrics API route
│   │   └── webhooks/        # Webhook endpoints
│   ├── page.tsx             # Dashboard page
│   └── layout.tsx            # Root layout
├── components/
│   ├── OrderList.tsx        # Orders list component
│   └── MetricsChart.tsx     # Metrics visualization
├── lib/
│   ├── mongodb.ts           # MongoDB connection
│   ├── shopify.ts           # Shopify API client
│   └── orders.ts            # Order data access
└── types/
    └── order.ts             # TypeScript types
```

## Design Decisions

### Architecture
- **Full-stack Next.js**: Single codebase for faster development and simpler deployment
- **Server Components**: Direct database access for better performance
- **API Routes**: RESTful endpoints for client-side data fetching and order synchronization
- **React Query (TanStack Query)**: Client-side state management and caching for optimal data fetching and synchronization

#### Why Direct Webhooks Instead of GCP?

For our current scale (~1000 orders/day), we use Shopify webhooks directly rather than routing through GCP services (Pub/Sub, Cloud Functions) because:

- **Simplicity**: Direct webhook endpoints in Next.js are easier to develop, test, and maintain
- **Cost**: No additional GCP service fees or infrastructure overhead
- **Performance**: Lower latency with immediate processing, no queue delays
- **Reliability**: Shopify automatically retries failed webhooks, which is sufficient for our needs

If we scale significantly (10,000+ orders/day) or need complex event processing, we can migrate to GCP services later.

### Sync Strategy

#### Smart Sync Selection
The application uses a hybrid approach to sync orders from Shopify:

- **Bulk Operations API**: Used for initial syncs or when >100 new orders are detected
  - **Tradeoff**: Slower to start (requires Shopify to prepare data), but much more efficient for large datasets
  - **Benefit**: Reduces API rate limit concerns and handles thousands of orders efficiently
  - **Process**: Asynchronous - starts operation, polls for completion, then finalizes in background

- **Incremental GraphQL Queries**: Used when <100 new orders need syncing
  - **Tradeoff**: Multiple API calls for larger datasets, but immediate results
  - **Benefit**: Fast response time for small updates, no waiting for bulk operation preparation
  - **Process**: Synchronous - fetches and saves immediately

**Decision Rationale**: This approach balances performance and user experience. Small updates are fast, while large syncs use the most efficient method available.

#### Background Finalization
Bulk sync finalization (downloading, parsing, and saving data) runs entirely on the server in the background:

- **Tradeoff**: Requires polling mechanism on client to check status
- **Benefit**: 
  - Non-blocking - users can continue viewing existing orders during sync
  - Better scalability - long-running operations don't tie up client connections
  - Server-side processing is more reliable for large data operations
- **Implementation**: Client polls `/api/orders?status=bulk` every 5 seconds when status is "pending"

### Data Modeling
- **Flexible Schema**: Uses MongoDB's flexible document model to accommodate Shopify's order structure
  - **Tradeoff**: Less strict validation compared to SQL schemas
  - **Benefit**: Easy to adapt to Shopify API changes without migrations
- **Upsert Strategy**: Prevents duplicate orders while allowing updates
  - Uses order `id` as unique identifier
  - Updates existing orders if they change in Shopify

### State Management

#### Server-Side Caching
- **Bulk Sync State**: Stored in MongoDB `sync_state` collection with in-memory TTL cache (60s)
  - **Tradeoff**: Requires database write for state updates
  - **Benefit**: 
    - Survives server restarts
    - Reduces Shopify API calls (only checks when cache expires or status is pending)
    - Fast reads from memory cache

#### Client-Side State
- **React Query**: Handles all client-side data fetching, caching, and synchronization
  - **Tradeoff**: Additional bundle size (~50KB)
  - **Benefit**:
    - Automatic background refetching
    - Optimistic updates
    - Request deduplication
    - Built-in loading/error states

### User Experience

#### Non-Blocking Sync
- Orders remain visible and accessible during all sync operations
- **Tradeoff**: Users might see slightly stale data during sync
- **Benefit**: 
  - Better perceived performance
  - Users can continue working while sync happens in background
  - Clear status indicators show what's happening

#### Status Communication
- Multiple status indicators: toast notifications, banner messages, and UI state
- **Tradeoff**: More complex state management
- **Benefit**: Users always know what's happening with clear, non-intrusive feedback

### Performance Optimizations
- **Pagination**: Default 20 items per page, configurable up to 100
  - Reduces initial load time and memory usage
- **Efficient Queries**: Indexed queries on `created_at` for fast sorting
- **Batch Writes**: Orders saved in batches of 1000 for optimal database performance
- **Caching Strategy**: 
  - Server-side: 60s TTL cache for bulk sync state
  - Client-side: React Query manages cache with 1-minute stale time

## Development

```bash
# Run development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint
```

## License

Private project for Protect+ application.
