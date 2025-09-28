import { createClient } from 'redis';

let redisClient: any;
let redisPublisher: any;
let redisSubscriber: any;

export const initializeRedis = async () => {
  try {
    const redisURL = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = createClient({ url: redisURL });
    redisPublisher = createClient({ url: redisURL });
    redisSubscriber = createClient({ url: redisURL });
    
    await redisClient.connect();
    await redisPublisher.connect();
    await redisSubscriber.connect();
    
    console.log('Redis connected successfully');
  } catch (error) {
    console.error('Redis connection error:', error);
    throw error;
  }
};

export const getRedisClient = () => redisClient;
export const getRedisPublisher = () => redisPublisher;
export const getRedisSubscriber = () => redisSubscriber;