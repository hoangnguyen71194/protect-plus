export interface OrderLineItem {
  id: string;
  title: string;
  quantity: number;
  price: string;
  sku?: string;
}

export interface OrderShippingAddress {
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
}

export interface Order {
  _id?: string;
  id: string;
  order_number: number;
  email?: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_shipping_price_set?: {
    shop_money?: {
      amount: string;
      currency_code: string;
    };
  };
  shipping_address?: OrderShippingAddress;
  line_items: OrderLineItem[];
  financial_status?: string;
  fulfillment_status?: string;
  currency?: string;
  customer?: {
    id: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
}

export interface OrderMetrics {
  date: string;
  orderCount: number;
  revenue: number;
  shippingCost: number;
}

