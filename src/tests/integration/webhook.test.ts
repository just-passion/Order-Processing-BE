import request from 'supertest';
import { Application } from '../../index';

describe('Webhook Integration Tests', () => {
  let app: Application;

  beforeAll(async () => {
    app = new Application();
    await app.start();
  });

  afterAll(async () => {
    await app.shutdown();
  });

  describe('POST /api/webhook/order', () => {
    it('should accept valid webhook payload', async () => {
      const payload = {
        order: {
          customerId: 'CUST-12345',
          items: [
            { name: 'Laptop', quantity: 1, price: 999.99 },
          ],
        },
        metadata: {
          source: 'test',
          version: '1.0',
        },
      };

      const response = await request(app.getServer())
        .post('/api/webhook/order')
        .send(payload)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.orderId).toBeDefined();
    });

    it('should reject invalid webhook payload', async () => {
      const invalidPayload = {
        order: {
          customerId: '',
          items: [],
        },
      };

      await request(app.getServer())
        .post('/api/webhook/order')
        .send(invalidPayload)
        .expect(400);
    });
  });
});