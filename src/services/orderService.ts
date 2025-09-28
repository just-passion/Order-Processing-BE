import { v4 as uuidv4 } from 'uuid';
import OrderModel from '../models/Order';
import { Order, OrderStatus, OrderEvent } from '../types';
import { kafkaService } from './kafkaService';
import { redisService } from './redisService';

class OrderService {
  async createOrder(orderData: Omit<Order, 'orderId' | 'status'>): Promise<Order> {
    const orderId = uuidv4();
    
    const order = new OrderModel({
      ...orderData,
      orderId,
      status: OrderStatus.PENDING
    });
    
    const savedOrder = await order.save();
    
    // Send to Kafka
    const orderEvent: OrderEvent = {
      eventType: 'ORDER_CREATED',
      orderId: savedOrder.orderId,
      order: savedOrder.toObject(),
      timestamp: new Date().toISOString()
    };

    console.log({orderEvent})
    
    await kafkaService.publishOrderEvent(orderEvent);
    console.log({savedOrder})
    return savedOrder.toObject();
  }
  
  async getAllOrders(): Promise<Order[]> {
    const orders = await OrderModel.find().sort({ createdAt: -1 });
    return orders.map(order => order.toObject());
  }
  
  async getOrderById(orderId: string): Promise<Order | null> {
    const order = await OrderModel.findOne({ orderId });
    return order ? order.toObject() : null;
  }
  
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
    const order = await OrderModel.findOneAndUpdate(
      { orderId },
      { status },
      { new: true }
    );
    
    if (order) {
      // Send update event to Kafka
      const orderEvent: OrderEvent = {
        eventType: 'ORDER_UPDATED',
        orderId: order.orderId,
        order: order.toObject(),
        timestamp: new Date().toISOString()
      };
      
      await kafkaService.publishOrderEvent(orderEvent);
    }
    
    return order ? order.toObject() : null;
  }
  
  async processWebhookEvent(eventData: any): Promise<void> {
    // Process webhook event and send to Kafka
    const orderEvent: OrderEvent = {
      eventType: eventData.eventType || 'ORDER_UPDATED',
      orderId: eventData.orderId,
      order: eventData.order,
      timestamp: new Date().toISOString()
    };
    
    await kafkaService.publishOrderEvent(orderEvent);
  }
}

export const orderService = new OrderService();