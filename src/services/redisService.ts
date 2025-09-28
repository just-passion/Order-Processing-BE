import { getRedisClient, getRedisPublisher } from '../config/redis';
import { OrderEvent, OrderStatus } from '../types';

class RedisService {
  async cacheOrder(orderId: string, orderData: any): Promise<void> {
    try {
      const client = getRedisClient();
      await client.setEx(`order:${orderId}`, 3600, JSON.stringify(orderData));
      console.log('Order cached in Redis:', orderId);
    } catch (error) {
      console.error('Error caching order in Redis:', error);
      throw error;
    }
  }
  
  async getOrderFromCache(orderId: string): Promise<any | null> {
    try {
      const client = getRedisClient();
      const cachedOrder = await client.get(`order:${orderId}`);
      return cachedOrder ? JSON.parse(cachedOrder) : null;
    } catch (error) {
      console.error('Error getting order from Redis cache:', error);
      return null;
    }
  }
  
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    try {
      const client = getRedisClient();
      await client.hSet(`order:status:${orderId}`, 'status', status);
      await client.expire(`order:status:${orderId}`, 3600);
      console.log('Order status updated in Redis:', orderId, status);
    } catch (error) {
      console.error('Error updating order status in Redis:', error);
      throw error;
    }
  }
  
  async publishOrderUpdate(orderEvent: OrderEvent): Promise<void> {
    try {
      const publisher = getRedisPublisher();
      await publisher.publish('order-updates', JSON.stringify(orderEvent));
      
      // Emit to Socket.IO clients
      if (global.io) {
        global.io.emit('orderUpdate', orderEvent);
      }
      
      console.log('Order update published to Redis and Socket.IO:', orderEvent.orderId);
    } catch (error) {
      console.error('Error publishing order update:', error);
      throw error;
    }
  }
}

export const redisService = new RedisService();