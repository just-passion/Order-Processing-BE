import { OrderService } from '../../../services/order.service';
import { KafkaService } from '../../../services/kafka.service';
import { RedisService } from '../../../services/redis.service';
import { WebhookPayload } from '../../../types';

jest.mock('../../../services/kafka.service');
jest.mock('../../../services/redis.service');

describe('OrderService', () => {
  let orderService: OrderService;
  let mockKafkaService: jest.Mocked<KafkaService>;
  let mockRedisService: jest.Mocked<RedisService>;

  beforeEach(() => {
    mockKafkaService = new KafkaService() as jest.Mocked<KafkaService>;
    mockRedisService = new RedisService() as jest.Mocked<RedisService>;
    orderService = new OrderService(mockKafkaService, mockRedisService);
  });

  describe('processWebhook', () => {
    it('should process webhook successfully', async () => {
      const payload: WebhookPayload = {
        order: {
          customerId: 'CUST-123',
          items: [{ name: 'Test Product', quantity: 1, price: 99.99 }],
        },
        metadata: { source: 'test' },
      };

      mockRedisService.cacheOrder.mockResolvedValue();
      mockRedisService.addToRecentOrders.mockResolvedValue();
      mockKafkaService.publishOrderEvent.mockResolvedValue();

      const result = await orderService.processWebhook(payload);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('message');
      expect(mockRedisService.cacheOrder).toHaveBeenCalled();
      expect(mockKafkaService.publishOrderEvent).toHaveBeenCalled();
    });

    it('should handle invalid payload', async () => {
      const invalidPayload: any = {
        order: {
          customerId: '',
          items: [],
        },
      };

      await expect(orderService.processWebhook(invalidPayload))
        .rejects
        .toThrow();
    });
  });
});