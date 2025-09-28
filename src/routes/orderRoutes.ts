import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  webhookHandler
} from '../controllers/orderController';

const router = Router();

router.post('/', createOrder);
router.get('/', getOrders);
router.get('/:orderId', getOrderById);
router.patch('/:orderId/status', updateOrderStatus);
router.post('/webhook', webhookHandler);

export default router;