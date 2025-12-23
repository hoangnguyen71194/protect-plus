import Navigation from "@/components/Navigation";
import OrderList from "@/components/OrderList";

export default function OrdersPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="mt-2 text-gray-600">
            View and manage orders from your Shopify store
          </p>
        </div>

        <OrderList />
      </div>
    </div>
  );
}
