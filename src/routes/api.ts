import { Router } from 'express';
import { OrderService } from '../services/order.service';
import { WebSocketService } from '../services/websocket.service';

export const createApiRouter = (
  orderService: OrderService,
  websocketService: WebSocketService
): Router => {
  const router = Router();

  // Get order by ID
  router.get('/orders/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const order = await orderService.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      res.json({
        success: true,
        order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve order',
      });
    }
  });

  // Get recent orders
  router.get('/orders', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const orders = await orderService.getRecentOrders(limit);
      
      res.json({
        success: true,
        orders,
        count: orders.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve orders',
      });
    }
  });

  // Get system metrics
  router.get('/metrics', async (req, res) => {
    try {
      const metrics = await orderService.getMetrics();
      const processingStats = await orderService.getProcessingStats();
      
      res.json({
        success: true,
        metrics,
        processingStats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve metrics',
      });
    }
  });

  // Health check
  router.get('/health', async (req, res) => {
    try {
      const health = await orderService.healthCheck();
      const connectionStats = websocketService.getConnectionStats();
      
      res.json({
        success: true,
        ...health,
        websocket: connectionStats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        error: 'Health check failed',
      });
    }
  });

  // Retry failed order
  router.post('/orders/:orderId/retry', async (req, res) => {
    try {
      const { orderId } = req.params;
      const success = await orderService.retryFailedOrder(orderId);
      
      if (!success) {
        return res.status(400).json({
          success: false,
          error: 'Cannot retry this order',
        });
      }

      res.json({
        success: true,
        message: 'Order retry initiated',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retry order',
      });
    }
  });

  return router;
};