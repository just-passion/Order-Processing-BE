import mongoose, { Schema, Document } from 'mongoose';
import { Order, OrderItem, OrderStatus } from '../types';

const OrderItemSchema = new Schema<OrderItem>({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 }
});

const OrderSchema = new Schema<Order & Document>({
  orderId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  customerName: { 
    type: String, 
    required: true 
  },
  customerEmail: { 
    type: String, 
    required: true 
  },
  items: [OrderItemSchema],
  totalAmount: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  status: { 
    type: String, 
    enum: Object.values(OrderStatus),
    default: OrderStatus.PENDING 
  }
}, {
  timestamps: true
});

export default mongoose.model<Order & Document>('Order', OrderSchema);