import { getKafkaProducer } from '../config/kafka';
import { OrderEvent } from '../types';

class KafkaService {
  async publishOrderEvent(orderEvent: OrderEvent): Promise<void> {
    try {
      const producer = getKafkaProducer();
      
      await producer.send({
        topic: 'order-events',
        messages: [
          {
            key: orderEvent.orderId,
            value: JSON.stringify(orderEvent),
            timestamp: orderEvent.timestamp
          }
        ]
      });
      
      console.log('Order event published to Kafka:', orderEvent.eventType, orderEvent.orderId);
    } catch (error) {
      console.error('Error publishing to Kafka:', error);
      throw error;
    }
  }
}

export const kafkaService = new KafkaService();