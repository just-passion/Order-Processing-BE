// src/services/order.service.ts

import { v4 as uuidv4 } from 'uuid';
import { Order, OrderEvent, WebhookPayload, ProcessingResult, Metrics } from '../types';
import { KafkaService } from './kafka.service';
import { RedisService } from './redis.service';
import { logger } from '../utils/logger';

export class OrderService {
  private kafkaService: KafkaService;
  private redisService: RedisService;
  private processingStats = {
    totalProcessed: 0,
    successCount: 0,
    errorCount: 0,
    totalProcessingTime: 0,
  };

  constructor(kafkaService: KafkaService, redisService: RedisService) {
    this.kafkaService = kafkaService;
    this.redisService = redisService;
    this.setupKafkaHandlers();
  }

  async processWebhook(payload: WebhookPayload): Promise<{ orderId: string; message: string }> {
    const startTime = Date.now();

    try {
      // Generate order ID and create complete order object
      const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const order: Order = {
        id: orderId,
        customerId: payload.order.customerId,
        items: payload.order.items,
        status: 'pending',
        totalAmount: this.calculateTotalAmount(payload.order.items),
        timestamp: new Date().toISOString(),
        retryCount: 0,
      };

      // Validate order data
      this.validateOrder(order);

      // Create order event
      const orderEvent: OrderEvent = {
        id: uuidv4(),
        type: 'ORDER_CREATED',
        order,
        timestamp: new Date().toISOString(),
        source: payload.metadata?.source || 'webhook',
      };

      // Cache the order in Redis
      await this.redisService.cacheOrder(order);
      await this.redisService.addToRecentOrders(order);

      // Publish to Kafka for async processing
      await this.kafkaService.publishOrderEvent(orderEvent);

      const processingTime = Date.now() - startTime;
      logger.info('Webhook processed successfully', {
        orderId,
        totalAmount: order.totalAmount,
        itemCount: order.items.length,
        processingTime,
      });

      // Update metrics
      await this.updateMetrics();

      return {
        orderId,
        message: 'Order received and queued for processing',
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Failed to process webhook', {
        error,
        processingTime,
        payload: JSON.stringify(payload),
      });
      throw error;
    }
  }

  private setupKafkaHandlers(): void {
    // Handler for order created events
    this.kafkaService.registerMessageHandler('ORDER_CREATED', async (orderEvent: OrderEvent) => {
      await this.handleOrderCreated(orderEvent);
    });

    // Handler for order updated events
    this.kafkaService.registerMessageHandler('ORDER_UPDATED', async (orderEvent: OrderEvent) => {
      await this.handleOrderUpdated(orderEvent);
    });
  }

  private async handleOrderCreated(orderEvent: OrderEvent): Promise<void> {
    const startTime = Date.now();
    const { order } = orderEvent;

    try {
      logger.info('Processing order created event', {
        orderId: order.id,
        customerId: order.customerId,
        totalAmount: order.totalAmount,
      });

      // Update order status to processing
      await this.updateOrderStatus(order.id, 'processing');

      // Simulate business logic processing
      await this.simulateOrderProcessing(order);

      // Randomly determine if order succeeds or fails (90% success rate)
      const isSuccess = Math.random() > 0.1;
      const processingTime = Date.now() - startTime;

      if (isSuccess) {
        await this.completeOrder(order.id, processingTime);
        this.processingStats.successCount++;
      } else {
        await this.failOrder(order.id, 'Random processing failure for demo', processingTime);
        this.processingStats.errorCount++;
      }

      this.processingStats.totalProcessed++;
      this.processingStats.totalProcessingTime += processingTime;

      // Update metrics after processing
      await this.updateMetrics();

      logger.info('Order processing completed', {
        orderId: order.id,
        success: isSuccess,
        processingTime,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      await this.failOrder(order.id, (error as Error).message, processingTime);
      this.processingStats.errorCount++;
      this.processingStats.totalProcessed++;

      logger.error('Error processing order created event', {
        orderId: order.id,
        error,
        processingTime,
      });
    }
  }

  private async handleOrderUpdated(orderEvent: OrderEvent): Promise<void> {
    const { order } = orderEvent;

    try {
      logger.info('Processing order updated event', {
        orderId: order.id,
        status: order.status,
      });

      // Update the cached order
      await this.redisService.cacheOrder(order);
      await this.redisService.publishOrderUpdate(order);

      // Send notification about the update
      await this.kafkaService.publishNotification({
        type: 'ORDER_STATUS_CHANGED',
        orderId: order.id,
        customerId: order.customerId,
        newStatus: order.status,
        timestamp: new Date().toISOString(),
      });

      logger.info('Order update processed', {
        orderId: order.id,
        status: order.status,
      });
    } catch (error) {
      logger.error('Error processing order updated event', {
        orderId: order.id,
        error,
      });
    }
  }

  private async updateOrderStatus(orderId: string, status: Order['status'], processingTime?: number): Promise<void> {
    try {
      await this.redisService.updateOrderStatus(orderId, status, processingTime);

      // Create an order updated event
      const cachedOrder = await this.redisService.getOrder(orderId);
      if (cachedOrder) {
        const orderEvent: OrderEvent = {
          id: uuidv4(),
          type: 'ORDER_UPDATED',
          order: { ...cachedOrder, status, ...(processingTime && { processingTime }) },
          timestamp: new Date().toISOString(),
          source: 'order-service',
        };

        await this.kafkaService.publishOrderEvent(orderEvent);
      }
    } catch (error) {
      logger.error('Failed to update order status', {
        orderId,
        status,
        error,
      });
      throw error;
    }
  }

  private async completeOrder(orderId: string, processingTime: number): Promise<void> {
    await this.updateOrderStatus(orderId, 'completed', processingTime);

    // Send completion notification
    await this.kafkaService.publishNotification({
      type: 'ORDER_COMPLETED',
      orderId,
      processingTime,
      timestamp: new Date().toISOString(),
    });

    logger.info('Order completed successfully', {
      orderId,
      processingTime,
    });
  }

  private async failOrder(orderId: string, reason: string, processingTime: number): Promise<void> {
    await this.updateOrderStatus(orderId, 'failed', processingTime);

    // Send failure notification
    await this.kafkaService.publishNotification({
      type: 'ORDER_FAILED',
      orderId,
      reason,
      processingTime,
      timestamp: new Date().toISOString(),
    });

    logger.warn('Order failed', {
      orderId,
      reason,
      processingTime,
    });
  }

  private async simulateOrderProcessing(order: Order): Promise<void> {
    // Simulate processing time based on order complexity
    const baseProcessingTime = 1000; // 1 second base
    const itemComplexity = order.items.length * 200; // 200ms per item
    const amountComplexity = Math.min(order.totalAmount / 100, 1000); // Up to 1 second based on amount

    const totalProcessingTime = baseProcessingTime + itemComplexity + amountComplexity;
    
    // Add some randomness (±50%)
    const actualProcessingTime = totalProcessingTime * (0.5 + Math.random());

    await new Promise(resolve => setTimeout(resolve, actualProcessingTime));

    logger.debug('Simulated order processing', {
      orderId: order.id,
      simulatedTime: Math.round(actualProcessingTime),
      baseTime: baseProcessingTime,
      itemComplexity,
      amountComplexity,
    });
  }

  private calculateTotalAmount(items: Order['items']): number {
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    return Math.round(total * 100) / 100; // Round to 2 decimal places
  }

  private validateOrder(order: Order): void {
    if (!order.customerId) {
      throw new Error('Customer ID is required');
    }

    if (!order.items || order.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    for (const item of order.items) {
      if (!item.name || item.quantity <= 0 || item.price < 0) {
        throw new Error(`Invalid item: ${JSON.stringify(item)}`);
      }
    }

    if (order.totalAmount <= 0) {
      throw new Error('Total amount must be greater than zero');
    }
  }

  async getOrder(orderId: string): Promise<Order | null> {
    try {
      return await this.redisService.getOrder(orderId);
    } catch (error) {
      logger.error('Failed to get order', { orderId, error });
      return null;
    }
  }

  async getRecentOrders(limit = 20): Promise<Order[]> {
    try {
      return await this.redisService.getRecentOrders(limit);
    } catch (error) {
      logger.error('Failed to get recent orders', { error });
      return [];
    }
  }

  async getMetrics(): Promise<Metrics> {
    try {
      // Try to get cached metrics first
      let cachedMetrics = await this.redisService.getMetrics();
      
      if (!cachedMetrics) {
        // Calculate fresh metrics
        cachedMetrics = await this.calculateMetrics();
        await this.redisService.cacheMetrics(cachedMetrics);
      }

      return cachedMetrics;
    } catch (error) {
      logger.error('Failed to get metrics', { error });
      return this.getDefaultMetrics();
    }
  }

  private async calculateMetrics(): Promise<Metrics> {
    try {
      const recentOrders = await this.redisService.getRecentOrders(100); // Get more orders for better metrics
      
      const totalOrders = recentOrders.length;
      const completedOrders = recentOrders.filter(o => o.status === 'completed').length;
      const failedOrders = recentOrders.filter(o => o.status === 'failed').length;
      const pendingOrders = recentOrders.filter(o => o.status === 'pending' || o.status === 'processing').length;
      
      // Calculate average processing time for completed orders
      const completedOrdersWithTime = recentOrders.filter(o => o.status === 'completed' && o.processingTime);
      const averageProcessingTime = completedOrdersWithTime.length > 0
        ? completedOrdersWithTime.reduce((sum, o) => sum + (o.processingTime || 0), 0) / completedOrdersWithTime.length
        : 0;

      // Calculate throughput per minute (orders processed in the last hour)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const recentlyProcessed = recentOrders.filter(o => {
        const orderTime = new Date(o.timestamp).getTime();
        return orderTime > oneHourAgo && (o.status === 'completed' || o.status === 'failed');
      });
      const throughputPerMinute = recentlyProcessed.length / 60; // Average per minute over the last hour

      return {
        totalOrders,
        completedOrders,
        failedOrders,
        pendingOrders,
        averageProcessingTime: Math.round(averageProcessingTime),
        throughputPerMinute: Math.round(throughputPerMinute * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to calculate metrics', { error });
      return this.getDefaultMetrics();
    }
  }

  private async updateMetrics(): Promise<void> {
    try {
      const metrics = await this.calculateMetrics();
      await this.redisService.cacheMetrics(metrics);
      await this.redisService.publishMetrics(metrics);
    } catch (error) {
      logger.error('Failed to update metrics', { error });
    }
  }

  private getDefaultMetrics(): Metrics {
    return {
      totalOrders: 0,
      completedOrders: 0,
      failedOrders: 0,
      pendingOrders: 0,
      averageProcessingTime: 0,
      throughputPerMinute: 0,
    };
  }

  async getProcessingStats(): Promise<typeof this.processingStats> {
    return {
      ...this.processingStats,
      averageProcessingTime: this.processingStats.totalProcessed > 0
        ? Math.round(this.processingStats.totalProcessingTime / this.processingStats.totalProcessed)
        : 0,
    };
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const kafkaHealth = await this.kafkaService.healthCheck();
      const redisHealth = await this.redisService.healthCheck();
      const processingStats = await this.getProcessingStats();

      const isHealthy = kafkaHealth.status === 'healthy' && redisHealth.status === 'healthy';

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        details: {
          kafka: kafkaHealth,
          redis: redisHealth,
          processingStats,
          uptime: process.uptime(),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  // Rate limiting for webhook endpoints
  async checkWebhookRateLimit(clientId: string): Promise<boolean> {
    const limit = 100; // 100 requests per minute
    const windowSeconds = 60;
    
    return await this.redisService.checkRateLimit(
      `webhook:${clientId}`,
      limit,
      windowSeconds
    );
  }

  // Retry failed orders
  async retryFailedOrder(orderId: string): Promise<boolean> {
    try {
      const order = await this.redisService.getOrder(orderId);
      
      if (!order || order.status !== 'failed') {
        logger.warn('Cannot retry order: not found or not in failed status', {
          orderId,
          currentStatus: order?.status,
        });
        return false;
      }

      const retryCount = (order.retryCount || 0) + 1;
      const maxRetries = 3;

      if (retryCount > maxRetries) {
        logger.warn('Order exceeded maximum retry attempts', {
          orderId,
          retryCount,
          maxRetries,
        });
        return false;
      }

      // Reset order status and increment retry count
      const retryOrder: Order = {
        ...order,
        status: 'pending',
        retryCount,
      };

      // Create retry event
      const retryEvent: OrderEvent = {
        id: uuidv4(),
        type: 'ORDER_CREATED', // Treat as new order for processing
        order: retryOrder,
        timestamp: new Date().toISOString(),
        source: 'retry-mechanism',
      };

      // Update cache and publish event
      await this.redisService.cacheOrder(retryOrder);
      await this.kafkaService.publishOrderEvent(retryEvent);

      logger.info('Order retry initiated', {
        orderId,
        retryCount,
      });

      return true;
    } catch (error) {
      logger.error('Failed to retry order', { orderId, error });
      return false;
    }
  }

  // Batch operations for testing/demo
  async simulateBulkOrders(count: number): Promise<{ ordersCreated: number; errors: number }> {
    let ordersCreated = 0;
    let errors = 0;

    const sampleItems = [
      { name: 'Laptop', quantity: 1, price: 999.99 },
      { name: 'Mouse', quantity: 2, price: 29.99 },
      { name: 'Keyboard', quantity: 1, price: 79.99 },
      { name: 'Monitor', quantity: 1, price: 299.99 },
      { name: 'Headphones', quantity: 1, price: 149.99 },
    ];

    for (let i = 0; i < count; i++) {
      try {
        const randomItems = sampleItems.slice(0, Math.floor(Math.random() * 3) + 1);
        const payload: WebhookPayload = {
          order: {
            customerId: `CUST-${Math.floor(Math.random() * 10000)}`,
            items: randomItems,
            status: 'pending',
            totalAmount: 0, // Will be calculated
          },
          metadata: {
            source: 'bulk-simulation',
            version: '1.0',
          },
        };

        await this.processWebhook(payload);
        ordersCreated++;
      } catch (error) {
        errors++;
        logger.error('Error in bulk order simulation', { 
          orderIndex: i, 
          error 
        });
      }

      // Add small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('Bulk order simulation completed', {
      requested: count,
      ordersCreated,
      errors,
    });

    return { ordersCreated, errors };
  }
}