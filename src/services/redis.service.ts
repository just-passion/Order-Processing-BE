// src/services/redis.service.ts
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Order, Metrics } from '../types';

export class RedisService {
  private redis: Redis;
  private subscriber: Redis;
  private isConnected = false;
  private orderUpdateCallbacks: ((order: Order) => void)[] = [];

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    this.subscriber = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info('Redis connected');
    });

    this.redis.on('ready', () => {
      this.isConnected = true;
      logger.info('Redis ready for operations');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error', { error });
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis connection closed');
    });

    // Subscriber events
    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error', { error });
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.redis.connect(),
        this.subscriber.connect()
      ]);
      
      // Subscribe to order updates channel
      await this.subscriber.subscribe('order-updates', 'metrics-updates');
      
      logger.info('Redis services connected and subscribed');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.redis.disconnect(),
        this.subscriber.disconnect()
      ]);
      this.isConnected = false;
      logger.info('Disconnected from Redis');
    } catch (error) {
      logger.error('Error disconnecting from Redis', { error });
      throw error;
    }
  }

  // Order operations
  async cacheOrder(order: Order): Promise<void> {
    try {
      const key = `order:${order.id}`;
      const orderData = {
        ...order,
        cachedAt: new Date().toISOString(),
      };
      
      await this.redis.setex(key, 3600, JSON.stringify(orderData)); // 1 hour TTL
      
      logger.debug('Order cached successfully', { orderId: order.id });
    } catch (error) {
      logger.error('Failed to cache order', { orderId: order.id, error });
      throw error;
    }
  }

  async getOrder(orderId: string): Promise<Order | null> {
    try {
      const key = `order:${orderId}`;
      const orderData = await this.redis.get(key);
      
      if (!orderData) {
        return null;
      }
      
      const order = JSON.parse(orderData);
      delete order.cachedAt; // Remove cache metadata
      
      return order;
    } catch (error) {
      logger.error('Failed to get order from cache', { orderId, error });
      return null;
    }
  }

  async updateOrderStatus(orderId: string, status: Order['status'], processingTime?: number): Promise<void> {
    try {
      const existingOrder = await this.getOrder(orderId);
      if (!existingOrder) {
        throw new Error(`Order ${orderId} not found in cache`);
      }

      const updatedOrder: Order = {
        ...existingOrder,
        status,
        ...(processingTime && { processingTime }),
      };

      await this.cacheOrder(updatedOrder);
      
      logger.debug('Order status updated', { orderId, status, processingTime });
    } catch (error) {
      logger.error('Failed to update order status', { orderId, status, error });
      throw error;
    }
  }

  async addToRecentOrders(order: Order): Promise<void> {
    try {
      const key = 'recent-orders';
      const orderData = JSON.stringify(order);
      
      // Add to list and keep only the most recent 100 orders
      await Promise.all([
        this.redis.lpush(key, orderData),
        this.redis.ltrim(key, 0, 99) // Keep only first 100 items
      ]);
      
      logger.debug('Order added to recent orders', { orderId: order.id });
    } catch (error) {
      logger.error('Failed to add order to recent orders', { orderId: order.id, error });
      throw error;
    }
  }

  async getRecentOrders(limit = 20): Promise<Order[]> {
    try {
      const key = 'recent-orders';
      const actualLimit = Math.min(limit, 100);
      const orderStrings = await this.redis.lrange(key, 0, actualLimit - 1);
      
      const orders = orderStrings.map(orderString => {
        try {
          return JSON.parse(orderString);
        } catch (parseError) {
          logger.warn('Failed to parse order from recent orders', { parseError });
          return null;
        }
      }).filter(order => order !== null);
      
      return orders;
    } catch (error) {
      logger.error('Failed to get recent orders', { error });
      return [];
    }
  }

  // Metrics operations
  async cacheMetrics(metrics: Metrics): Promise<void> {
    try {
      const key = 'system-metrics';
      const metricsData = {
        ...metrics,
        cachedAt: new Date().toISOString(),
      };
      
      await this.redis.setex(key, 60, JSON.stringify(metricsData)); // 1 minute TTL
      
      logger.debug('Metrics cached successfully');
    } catch (error) {
      logger.error('Failed to cache metrics', { error });
      throw error;
    }
  }

  async getMetrics(): Promise<Metrics | null> {
    try {
      const key = 'system-metrics';
      const metricsData = await this.redis.get(key);
      
      if (!metricsData) {
        return null;
      }
      
      const metrics = JSON.parse(metricsData);
      delete metrics.cachedAt; // Remove cache metadata
      
      return metrics;
    } catch (error) {
      logger.error('Failed to get metrics from cache', { error });
      return null;
    }
  }

  // Pub/Sub operations
  async publishOrderUpdate(order: Order): Promise<void> {
    try {
      const message = {
        type: 'ORDER_UPDATE',
        order,
        timestamp: new Date().toISOString(),
      };
      
      await this.redis.publish('order-updates', JSON.stringify(message));
      
      logger.debug('Order update published', { orderId: order.id, status: order.status });
    } catch (error) {
      logger.error('Failed to publish order update', { orderId: order.id, error });
      throw error;
    }
  }

  async publishMetrics(metrics: Metrics): Promise<void> {
    try {
      const message = {
        type: 'METRICS_UPDATE',
        metrics,
        timestamp: new Date().toISOString(),
      };
      
      await this.redis.publish('metrics-updates', JSON.stringify(message));
      
      logger.debug('Metrics update published');
    } catch (error) {
      logger.error('Failed to publish metrics update', { error });
      throw error;
    }
  }

  subscribeToOrderUpdates(callback: (order: Order) => void): void {
    this.orderUpdateCallbacks.push(callback);
  }

  private handleMessage(channel: string, message: string): void {
    try {
      const parsedMessage = JSON.parse(message);
      
      switch (channel) {
        case 'order-updates':
          if (parsedMessage.type === 'ORDER_UPDATE' && parsedMessage.order) {
            this.orderUpdateCallbacks.forEach(callback => {
              try {
                callback(parsedMessage.order);
              } catch (callbackError) {
                logger.error('Error in order update callback', { callbackError });
              }
            });
          }
          break;
        
        case 'metrics-updates':
          logger.debug('Metrics update received via Redis pub/sub');
          break;
        
        default:
          logger.warn('Received message from unknown channel', { channel });
      }
    } catch (error) {
      logger.error('Failed to handle Redis message', { channel, error });
    }
  }

  // Rate limiting
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
      const current = await this.redis.incr(key);
      
      if (current === 1) {
        await this.redis.expire(key, windowSeconds);
      }
      
      return current <= limit;
    } catch (error) {
      logger.error('Failed to check rate limit', { key, error });
      return true; // Allow request on error
    }
  }

  // Distributed locking
  async acquireLock(lockKey: string, ttlSeconds = 30): Promise<string | null> {
    try {
      const lockValue = `lock:${Date.now()}:${Math.random()}`;
      const result = await this.redis.set(
        `lock:${lockKey}`, 
        lockValue, 
        'EX', 
        ttlSeconds, 
        'NX'
      );
      
      return result === 'OK' ? lockValue : null;
    } catch (error) {
      logger.error('Failed to acquire lock', { lockKey, error });
      return null;
    }
  }

  async releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
    try {
      const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await this.redis.eval(luaScript, 1, `lock:${lockKey}`, lockValue);
      return result === 1;
    } catch (error) {
      logger.error('Failed to release lock', { lockKey, error });
      return false;
    }
  }

  // Analytics and aggregations
  async recordOrderProcessingTime(processingTime: number): Promise<void> {
    try {
      const key = 'processing-times';
      const timestamp = Math.floor(Date.now() / 1000);
      
      await Promise.all([
        this.redis.zadd(key, timestamp, `${timestamp}:${processingTime}`),
        this.redis.expire(key, 86400) // Keep for 24 hours
      ]);
      
      logger.debug('Processing time recorded', { processingTime, timestamp });
    } catch (error) {
      logger.error('Failed to record processing time', { processingTime, error });
    }
  }

  async getAverageProcessingTime(hoursBack = 1): Promise<number> {
    try {
      const key = 'processing-times';
      const now = Math.floor(Date.now() / 1000);
      const since = now - (hoursBack * 3600);
      
      const results = await this.redis.zrangebyscore(key, since, now);
      
      if (results.length === 0) {
        return 0;
      }
      
      const processingTimes = results.map(result => {
        const [, processingTime] = result.split(':');
        return parseInt(processingTime, 10);
      }).filter(time => !isNaN(time));
      
      return processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
    } catch (error) {
      logger.error('Failed to get average processing time', { hoursBack, error });
      return 0;
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';
      
      return {
        status: 'healthy',
        details: {
          connected: this.isConnected,
          latency,
          memoryUsage,
          host: config.redis.host,
          port: config.redis.port,
          database: config.redis.db,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          connected: this.isConnected,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  // Utility methods
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async flushTestData(): Promise<void> {
    if (config.nodeEnv !== 'test') {
      throw new Error('flushTestData can only be called in test environment');
    }
    
    try {
      await this.redis.flushdb();
      logger.info('Test data flushed from Redis');
    } catch (error) {
      logger.error('Failed to flush test data', { error });
      throw error;
    }
  }
}