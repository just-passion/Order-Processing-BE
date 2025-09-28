export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalAmount: number;
  timestamp: string;
  processingTime?: number;
  retryCount?: number;
}

export interface OrderEvent {
  id: string;
  type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'ORDER_COMPLETED' | 'ORDER_FAILED';
  order: Order;
  timestamp: string;
  source: string;
}

export interface WebhookPayload {
  order: {
    customerId: string;
    items: OrderItem[];
    status?: Order['status'];
    totalAmount?: number;
  };
  metadata?: {
    source?: string;
    version?: string;
    [key: string]: any;
  };
}

export interface Metrics {
  totalOrders: number;
  completedOrders: number;
  failedOrders: number;
  pendingOrders: number;
  averageProcessingTime: number;
  throughputPerMinute: number;
}

export interface KafkaMessage<T> {
  key: string;
  value: T;
  timestamp: string;
  headers: Record<string, string>;
}

export interface ProcessingResult {
  success: boolean;
  orderId: string;
  processingTime: number;
  error?: string;
}

export interface NotificationPayload {
  type: 'ORDER_COMPLETED' | 'ORDER_FAILED' | 'ORDER_STATUS_CHANGED';
  orderId: string;
  customerId?: string;
  newStatus?: Order['status'];
  reason?: string;
  processingTime?: number;
  timestamp: string;
}