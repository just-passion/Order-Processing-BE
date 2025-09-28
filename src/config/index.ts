import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0'),
  },
  
  kafka: {
    clientId: process.env.KAFKA_CLIENT_ID || 'order-processor',
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    consumer: {
      groupId: process.env.KAFKA_GROUP_ID || 'order-processing-group',
    },
    topics: {
      orders: process.env.KAFKA_ORDERS_TOPIC || 'orders',
      notifications: process.env.KAFKA_NOTIFICATIONS_TOPIC || 'notifications',
      deadLetter: process.env.KAFKA_DEAD_LETTER_TOPIC || 'dead-letter-queue',
    },
  },
  
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  },
  
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
};