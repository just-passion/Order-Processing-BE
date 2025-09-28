#!/bin/bash
set -e

echo "Starting development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Please start Docker first."
  exit 1
fi

# Start external services with Docker Compose
echo "Starting external services (Kafka, Redis)..."
docker-compose up -d kafka redis

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 10

# Start the development server
echo "Starting development server..."
npm run dev