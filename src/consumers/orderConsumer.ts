import dotenv from 'dotenv';
import { getKafka } from '../config/kafka';
import { initializeRedis } from '../config/redis';
import { redisService } from '../services/redisService';
import { OrderEvent, OrderStatus } from '../types';

dotenv.config();

async function startOrderConsumer() {
  try {
    // Initialize Redis
    await initializeRedis();
    
    const kafka = getKafka();
    const consumer = kafka.consumer({ groupId: 'order-processing-group' });
    
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: false });
    
    console.log('Order consumer started, waiting for messages...');
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          if (!message.value) return;
          
          const orderEvent: OrderEvent = JSON.parse(message.value.toString());
          console.log('Processing order event:', orderEvent.eventType, orderEvent.orderId);
          
          // Apply business logic
          await processOrderEvent(orderEvent);
          
          // Cache the order in Redis
          await redisService.cacheOrder(orderEvent.orderId, orderEvent.order);
          
          // Update order status in Redis
          await redisService.updateOrderStatus(orderEvent.orderId, orderEvent.order.status);
          
          // Publish update to Redis pub/sub (and Socket.IO)
          await redisService.publishOrderUpdate(orderEvent);
          
        } catch (error) {
          console.error('Error processing message:', error);
        }
      },
    });
    
  } catch (error) {
    console.error('Error starting order consumer:', error);
    process.exit(1);
  }
}

async function processOrderEvent(orderEvent: OrderEvent): Promise<void> {
  // Business logic processing
  switch (orderEvent.eventType) {
    case 'ORDER_CREATED':
      console.log('Processing new order:', orderEvent.orderId);
      // Simulate order validation
      if (orderEvent.order.totalAmount > 1000) {
        console.log('High-value order detected, flagging for review');
      }
      break;
      
    case 'ORDER_UPDATED':
      console.log('Processing order update:', orderEvent.orderId);
      // Simulate status-based logic
      if (orderEvent.order.status === OrderStatus.SHIPPED) {
        console.log('Order shipped, sending notification');
      }
      break;
      
    case 'ORDER_CANCELLED':
      console.log('Processing order cancellation:', orderEvent.orderId);
      break;
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down order consumer...');
  process.exit(0);
});

startOrderConsumer();