import { Kafka } from 'kafkajs';

let kafka: Kafka;
let producer: any;
let consumer: any;

export const initializeKafka = async () => {
  try {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    
    kafka = new Kafka({
      clientId: 'order-processing-app',
      brokers: brokers,
    });
    
    producer = kafka.producer();
    consumer = kafka.consumer({ groupId: 'order-processing-group' });
    
    await producer.connect();
    console.log('Kafka producer connected successfully');
  } catch (error) {
    console.error('Kafka connection error:', error);
    throw error;
  }
};

export const getKafka = () => kafka;
export const getKafkaProducer = () => producer;
export const getKafkaConsumer = () => consumer;