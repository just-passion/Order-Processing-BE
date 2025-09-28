import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils/logger';

const orderItemSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  quantity: Joi.number().integer().min(1).max(1000).required(),
  price: Joi.number().min(0).max(10000).required(),
});

const webhookSchema = Joi.object({
  order: Joi.object({
    customerId: Joi.string().min(1).max(50).required(),
    items: Joi.array().items(orderItemSchema).min(1).max(20).required(),
    status: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional(),
    totalAmount: Joi.number().min(0).optional(),
  }).required(),
  metadata: Joi.object({
    source: Joi.string().optional(),
    version: Joi.string().optional(),
  }).optional().unknown(true),
});

export const validateWebhook = (req: Request, res: Response, next: NextFunction) => {
  const { error, value } = webhookSchema.validate(req.body);
  
  if (error) {
    logger.warn('Webhook validation failed', {
      error: error.details,
      body: req.body,
      ip: req.ip,
    });
    
    return res.status(400).json({
      error: 'Invalid request data',
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      })),
    });
  }
  
  req.body = value;
  next();
};