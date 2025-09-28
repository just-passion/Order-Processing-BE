import mongoose, { Schema, Document } from 'mongoose';
import { Order, OrderItem, OrderStatus } from '../types';

// Define OrderItem schema without _id
const OrderItemSchema = new Schema<OrderItem>({
  productId: { 
    type: String, 
    required: true,
    trim: true
  },
  productName: { 
    type: String, 
    required: true,
    trim: true
  },
  quantity: { 
    type: Number, 
    required: true, 
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be an integer'
    }
  },
  price: { 
    type: Number, 
    required: true, 
    min: 0,
    validate: {
      validator: function(v: number) {
        return v >= 0 && Number.isFinite(v);
      },
      message: 'Price must be a valid positive number'
    }
  }
}, { _id: false }); // Disable _id for subdocuments

// Define Order schema
const OrderSchema = new Schema<Order & Document>({
  orderId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true,
    trim: true
  },
  customerName: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  customerEmail: { 
    type: String, 
    required: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(email: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Invalid email format'
    }
  },
  items: {
    type: [OrderItemSchema],
    required: true,
    validate: {
      validator: function(items: OrderItem[]) {
        return Array.isArray(items) && items.length > 0;
      },
      message: 'At least one item is required'
    }
  },
  totalAmount: { 
    type: Number, 
    required: true, 
    min: 0,
    validate: {
      validator: function(v: number) {
        return v >= 0 && Number.isFinite(v);
      },
      message: 'Total amount must be a valid positive number'
    }
  },
  status: { 
    type: String, 
    enum: Object.values(OrderStatus),
    default: OrderStatus.PENDING,
    required: true
  }
}, {
  timestamps: true, // This creates createdAt and updatedAt automatically
  collection: 'orders', // Explicit collection name
  versionKey: false // Disable __v field
});

// Add indexes for better performance
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ customerEmail: 1 });

// Add a pre-save middleware for validation
OrderSchema.pre('save', function(next) {
  try {
    // Ensure totalAmount matches sum of items
    const calculatedTotal = this.items.reduce((sum, item) => {
      return sum + (item.quantity * item.price);
    }, 0);
    
    // Allow small floating-point differences (1 cent)
    if (Math.abs(calculatedTotal - this.totalAmount) > 0.01) {
      const error = new Error(`Total amount mismatch. Expected: ${calculatedTotal.toFixed(2)}, Got: ${this.totalAmount.toFixed(2)}`);
      return next(error);
    }
    
    // Round totalAmount to 2 decimal places to prevent floating-point issues
    this.totalAmount = Math.round(this.totalAmount * 100) / 100;
    
    next();
  } catch (error: any) {
    next(error);
  }
});

// Add a method to convert to plain object safely
OrderSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  
  // Ensure dates are properly formatted
  if (obj.createdAt) {
    obj.createdAt = obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt.toString();
  }
  if (obj.updatedAt) {
    obj.updatedAt = obj.updatedAt instanceof Date ? obj.updatedAt.toISOString() : obj.updatedAt.toString();
  }
  
  // Remove any MongoDB-specific fields
  delete obj._id;
  delete obj.__v;
  
  return obj;
};

export default mongoose.model<Order & Document>('Order', OrderSchema);