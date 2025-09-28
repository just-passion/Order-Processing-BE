import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config';
import { logger } from '../utils/logger';
import { OrderEvent, KafkaMessage } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class KafkaService {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private isConnected = false;
  private messageHandlers = new Map<string, (message: any) => Promise<void>>();

  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        retries: 3,
        initialRetryTime: 300,
        maxRetryTime: 30000,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30000,
    });

    this.consumer = this.kafka.consumer({
      groupId: config.kafka.consumer.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async connect(): Promise<void> {
    try {
      logger.info('Connecting to Kafka...');
      
      await this.producer.connect();
      await this.consumer.connect();
      
      this.isConnected = true;
      logger.info('Successfully connected to Kafka', {
        brokers: config.kafka.brokers,
        clientId: config.kafka.clientId,
      });
    } catch (error) {
      logger.error('Failed to connect to Kafka', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.producer.disconnect();
        await this.consumer.disconnect();
        this.isConnected = false;
        logger.info('Disconnected from Kafka');
      }
    } catch (error) {
      logger.error('Error disconnecting from Kafka', { error });
      throw error;
    }
  }

  async publishOrderEvent(orderEvent: OrderEvent): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error('Kafka producer not connected');
      }

      const message: KafkaMessage<OrderEvent> = {
        key: orderEvent.order.id,
        value: orderEvent,
        timestamp: new Date().toISOString(),
        headers: {
          'event-type': orderEvent.type,
          'source': orderEvent.source,
          'correlation-id': uuidv4(),
        },
      };

      await this.producer.send({
        topic: config.kafka.topics.orders,
        messages: [{
          key: message.key,
          value: JSON.stringify(message.value),
          headers: message.headers,
          timestamp: message.timestamp,
        }],
      });

      logger.info('Published order event to Kafka', {
        orderId: orderEvent.order.id,
        eventType: orderEvent.type,
        topic: config.kafka.topics.orders,
      });
    } catch (error) {
      logger.error('Failed to publish order event to Kafka', {
        orderId: orderEvent.order.id,
        error,
      });
      throw error;
    }
  }

  async publishToDeadLetter(originalMessage: any, error: Error): Promise<void> {
    try {
      const deadLetterMessage = {
        originalMessage,
        error: {
          message: error.message,
          stack: error.stack,
        },
        failedAt: new Date().toISOString(),
        retryCount: originalMessage.retryCount || 0,
      };

      await this.producer.send({
        topic: config.kafka.topics.deadLetter,
        messages: [{
          key: originalMessage.key || uuidv4(),
          value: JSON.stringify(deadLetterMessage),
        }],
      });

      logger.warn('Message sent to dead letter queue', {
        originalKey: originalMessage.key,
        error: error.message,
      });
    } catch (deadLetterError) {
      logger.error('Failed to send message to dead letter queue', {
        originalError: error.message,
        deadLetterError,
      });
    }
  }

  registerMessageHandler(eventType: string, handler: (message: any) => Promise<void>): void {
    this.messageHandlers.set(eventType, handler);
    logger.info('Registered message handler', { eventType });
  }

  async startConsumer(): Promise<void> {
    try {
      await this.consumer.subscribe({
        topics: [config.kafka.topics.orders],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
          await this.handleMessage(topic, partition, message);
        },
      });

      logger.info('Kafka consumer started', {
        topics: [config.kafka.topics.orders],
        groupId: config.kafka.consumer.groupId,
      });
    } catch (error) {
      logger.error('Failed to start Kafka consumer', { error });
      throw error;
    }
  }

  private async handleMessage(topic: string, partition: number, message: any): Promise<void> {
    const startTime = Date.now();
    let orderEvent: OrderEvent | null = null;

    try {
      if (!message.value) {
        logger.warn('Received message with no value', { topic, partition });
        return;
      }

      orderEvent = JSON.parse(message.value.toString());
      const eventType = message.headers?.['event-type']?.toString() || orderEvent.type;

      logger.info('Processing Kafka message', {
        topic,
        partition,
        offset: message.offset,
        eventType,
        orderId: orderEvent.order.id,
      });

      const handler = this.messageHandlers.get(eventType);
      if (handler) {
        await handler(orderEvent);
        
        const processingTime = Date.now() - startTime;
        logger.info('Successfully processed message', {
          orderId: orderEvent.order.id,
          eventType,
          processingTime,
        });
      } else {
        logger.warn('No handler registered for event type', {
          eventType,
          orderId: orderEvent.order.id,
        });
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error processing Kafka message', {
        topic,
        partition,
        offset: message.offset,
        orderId: orderEvent?.order.id,
        processingTime,
        error,
      });

      // Send to dead letter queue for failed messages
      await this.publishToDeadLetter(orderEvent || message.value, error as Error);
    }
  }

  async publishNotification(notification: any): Promise<void> {
    try {
      await this.producer.send({
        topic: config.kafka.topics.notifications,
        messages: [{
          key: uuidv4(),
          value: JSON.stringify(notification),
          timestamp: new Date().toISOString(),
        }],
      });

      logger.info('Published notification', {
        type: notification.type,
        orderId: notification.orderId,
      });
    } catch (error) {
      logger.error('Failed to publish notification', { error });
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      
      const topics = await admin.listTopics();
      const metadata = await admin.fetchTopicMetadata({
        topics: [config.kafka.topics.orders],
      });
      
      await admin.disconnect();
      
      return {
        status: 'healthy',
        details: {
          connected: this.isConnected,
          topics: topics.length,
          orderTopicExists: topics.includes(config.kafka.topics.orders),
          metadata: metadata.topics.map(t => ({
            name: t.name,
            partitions: t.partitions.length,
          })),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          connected: this.isConnected,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}