# Protect+ Dashboard

A Shopify order analytics application built with Next.js, MongoDB, and Tailwind CSS.

## Features

- **Order Management**: View and manage orders from your Shopify store
- **Real-time Webhooks**: Automatically sync orders via Shopify webhooks
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

To enable automatic order syncing:

1. Go to your Shopify Admin → Settings → Notifications → Webhooks
2. Create a new webhook:
   - **Event**: Order creation
   - **Format**: JSON
   - **URL**: `https://your-domain.com/api/webhooks/orders`
   - **API version**: 2024-01
3. Copy the webhook secret and add it to `.env.local` as `SHOPIFY_WEBHOOK_SECRET`

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
- `POST /api/orders` - Manual sync orders from Shopify
- `GET /api/orders/[id]` - Get single order details
- `GET /api/metrics?days=30` - Get analytics metrics
- `POST /api/webhooks/orders` - Shopify webhook endpoint

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
- **API Routes**: RESTful endpoints for client-side data fetching and webhooks

### Data Modeling
- **Flexible Schema**: Uses MongoDB's flexible document model to accommodate Shopify's order structure
- **Upsert Strategy**: Prevents duplicate orders while allowing updates

### Performance
- **Pagination**: Default 20 items per page, configurable up to 100
- **Efficient Queries**: Indexed queries on `created_at` for fast sorting
- **Caching**: Server-side data fetching with appropriate cache strategies

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
