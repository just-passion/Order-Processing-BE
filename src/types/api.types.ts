import { Order, Metrics, OrderItem } from './index';

// API Request Types
export interface CreateOrderRequest {
  order: {
    customerId: string;
    items: OrderItem[];
    status?: Order['status'];
  };
  metadata?: {
    source?: string;
    version?: string;
    correlationId?: string;
    [key: string]: any;
  };
}

export interface UpdateOrderRequest {
  status?: Order['status'];
  items?: OrderItem[];
  metadata?: Record<string, any>;
}

export interface BulkOrderRequest {
  count: number;
  template?: Partial<Order>;
  randomize?: boolean;
}

export interface RetryOrderRequest {
  orderId: string;
  reason?: string;
}

export interface GetOrdersRequest {
  limit?: number;
  offset?: number;
  status?: Order['status'];
  customerId?: string;
  sortBy?: 'timestamp' | 'status' | 'totalAmount';
  sortOrder?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface OrderResponse extends ApiResponse<Order> {
  order?: Order;
}

export interface OrdersResponse extends ApiResponse<Order[]> {
  orders: Order[];
  count: number;
}

export interface MetricsResponse extends ApiResponse<Metrics> {
  metrics: Metrics;
  processingStats?: ProcessingStats;
}

export interface HealthResponse extends ApiResponse {
  status: 'healthy' | 'unhealthy';
  details: {
    services: ServiceHealth;
    uptime: number;
    memory: NodeJS.MemoryUsage;
    version: string;
    timestamp: string;
  };
}

export interface WebhookResponse extends ApiResponse {
  orderId: string;
  processingTime: number;
}

export interface BulkOrderResponse extends ApiResponse {
  result: {
    ordersCreated: number;
    errors: number;
    processingTime: number;
  };
}

// Service Health Types
export interface ServiceHealth {
  kafka: {
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      topics?: string[];
      metadata?: any;
      error?: string;
    };
  };
  redis: {
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      latency?: number;
      memoryUsage?: string;
      error?: string;
    };
  };
  websocket: {
    status: 'healthy' | 'unhealthy';
    connections: {
      total: number;
      active: number;
    };
  };
}

// Processing Statistics
export interface ProcessingStats {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  averageProcessingTime: number;
  throughputPerMinute: number;
  successRate: number;
  errorRate: number;
  lastProcessedAt?: string;
}

// Error Types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
}

export interface ValidationError extends ApiError {
  field: string;
  value: any;
  constraint: string;
}

// Webhook Types
export interface WebhookDelivery {
  id: string;
  url: string;
  event: string;
  payload: any;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  maxAttempts: number;
  nextRetry?: string;
  createdAt: string;
  deliveredAt?: string;
  error?: string;
}

// Query Types
export interface OrderQuery {
  id?: string;
  customerId?: string;
  status?: Order['status'] | Order['status'][];
  dateFrom?: Date | string;
  dateTo?: Date | string;
  amountFrom?: number;
  amountTo?: number;
  search?: string;
}

export interface MetricsQuery {
  period?: 'hour' | 'day' | 'week' | 'month';
  from?: Date | string;
  to?: Date | string;
  granularity?: 'minute' | 'hour' | 'day';
}

// WebSocket Message Types
export interface WebSocketMessage<T = any> {
  type: string;
  data: T;
  timestamp: string;
  id?: string;
}

export interface OrderUpdateMessage extends WebSocketMessage<Order> {
  type: 'ORDER_UPDATE';
  data: Order;
}

export interface MetricsUpdateMessage extends WebSocketMessage<Metrics> {
  type: 'METRICS_UPDATE';
  data: Metrics;
}

export interface SystemAlertMessage extends WebSocketMessage {
  type: 'SYSTEM_ALERT';
  data: {
    level: 'info' | 'warning' | 'error';
    message: string;
    details?: any;
  };
}

// Rate Limiting Types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// Authentication Types
export interface AuthToken {
  token: string;
  type: 'bearer' | 'api-key';
  expiresAt?: string;
  permissions: string[];
}

export interface UserContext {
  id: string;
  role: string;
  permissions: string[];
  metadata?: Record<string, any>;
}

// Cache Types
export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  createdAt: string;
  expiresAt: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: string;
}

// Export utility types for API responses
export type SuccessResponse<T = any> = ApiResponse<T> & { success: true };
export type ErrorResponse = ApiResponse & { success: false; error: string };

// HTTP Status Codes enum
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}