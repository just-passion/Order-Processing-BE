export const ORDER_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const EVENT_TYPES = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_UPDATED: 'ORDER_UPDATED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  ORDER_FAILED: 'ORDER_FAILED',
} as const;

export const WEBSOCKET_EVENTS = {
  ORDER_UPDATE: 'order-update',
  METRICS_UPDATE: 'metrics-update',
  SYSTEM_ALERT: 'system-alert',
  HEALTH_UPDATE: 'health-update',
} as const;

export const REDIS_KEYS = {
  ORDER_PREFIX: 'order:',
  RECENT_ORDERS: 'recent-orders',
  METRICS: 'system-metrics',
  RATE_LIMIT_PREFIX: 'rate:',
  LOCK_PREFIX: 'lock:',
} as const;

export const KAFKA_TOPICS = {
  ORDERS: 'orders',
  NOTIFICATIONS: 'notifications',
  DEAD_LETTER: 'dead-letter-queue',
} as const;