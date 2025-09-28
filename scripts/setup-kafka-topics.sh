#!/bin/bash

KAFKA_CONTAINER="order-notification-backend_kafka_1"

echo "Creating Kafka topics..."

# Create topics
docker exec $KAFKA_CONTAINER kafka-topics --create \
  --topic orders \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1

docker exec $KAFKA_CONTAINER kafka-topics --create \
  --topic notifications \
  --bootstrap-server localhost:9092 \
  --partitions 1 \
  --replication-factor 1

docker exec $KAFKA_CONTAINER kafka-topics --create \
  --topic dead-letter-queue \
  --bootstrap-server localhost:9092 \
  --partitions 1 \
  --replication-factor 1

echo "Kafka topics created successfully!"