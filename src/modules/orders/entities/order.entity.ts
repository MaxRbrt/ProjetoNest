export interface OrderItem {
  productId: number;
  quantity: number;
}

export class Order {
  id: number;
  items: OrderItem[];
  total: number;
  createdAt: Date;
}
