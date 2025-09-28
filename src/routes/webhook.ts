import { Router } from 'express';
import { OrderService } from '../services/order.service';
import { validateWebhook } from '../middleware/validation';
import { logger } from '../utils/logger';

export const createWebhookRouter = (orderService: OrderService): Router => {
  const router = Router();

  router.post('/order', validateWebhook, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const clientId = req.ip || 'unknown';
      
      // Check rate limit
      const isAllowed = await orderService.checkWebhookRateLimit(clientId);
      if (!isAllowed) {
        logger.warn('Rate limit exceeded', { clientId, ip: req.ip });
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests, please try again later',
        });
      }

      const result = await orderService.processWebhook(req.body);
      const processingTime = Date.now() - startTime;
      
      logger.info('Webhook processed successfully', {
        orderId: result.orderId,
        processingTime,
        clientId,
      });

      res.status(202).json({
        success: true,
        ...result,
        processingTime,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Webhook processing failed', {
        error,
        processingTime,
        body: req.body,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to process order',
      });
    }
  });

  // Bulk order endpoint for testing
  router.post('/bulk-orders', async (req, res) => {
    try {
      const { count = 10 } = req.body;
      const maxCount = 50;
      const actualCount = Math.min(count, maxCount);

      const result = await orderService.simulateBulkOrders(actualCount);
      
      res.json({
        success: true,
        message: `Bulk order simulation completed`,
        result,
      });
    } catch (error) {
      logger.error('Bulk order simulation failed', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to simulate bulk orders',
      });
    }
  });

  return router;
};