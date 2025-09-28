import { Request, Response } from 'express';
import { orderService } from '../services/orderService';
import { Order } from '../types';

export const createOrder = async (req: Request, res: Response) => {
  try {    
    // Validate required fields
    const { customerName, customerEmail, items, totalAmount } = req.body;
    
    if (!customerName || !customerEmail || !items || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: customerName, customerEmail, items, and totalAmount are required'
      });
    }
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items must be a non-empty array'
      });
    }
    
    // Validate each item
    for (const item of items) {
      if (!item.productId || !item.productName || !item.quantity || !item.price) {
        return res.status(400).json({
          success: false,
          message: 'Each item must have productId, productName, quantity, and price'
        });
      }
      
      if (item.quantity <= 0 || item.price <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Quantity and price must be positive numbers'
        });
      }
    }
    
    const orderData: Omit<Order, 'orderId' | 'status'> = {
      customerName,
      customerEmail,
      items,
      totalAmount: Number(totalAmount)
    };
    
    const order = await orderService.createOrder(orderData);
        
    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully'
    });
    
  } catch (error: any) {
    console.error('Error creating order:', error);
    
    // Handle specific MongoDB errors
    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + error.message
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Order ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    const orders = await orderService.getAllOrders();
    
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error: any) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    const order = await orderService.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    res.json({
      success: true,
      data: order
    });
  } catch (error: any) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
        
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const order = await orderService.updateOrderStatus(orderId, status);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    res.json({
      success: true,
      data: order,
      message: 'Order status updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

// Webhook endpoint for external order events
export const webhookHandler = async (req: Request, res: Response) => {
  try {
    const eventData = req.body;
    await orderService.processWebhookEvent(eventData);
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};