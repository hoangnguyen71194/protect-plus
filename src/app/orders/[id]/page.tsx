import Navigation from "@/components/Navigation";
import OrderDetail from "@/components/OrderDetail";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8">
        <OrderDetail orderId={id} />
      </div>
    </div>
  );
}

