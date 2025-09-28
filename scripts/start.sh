#!/bin/bash
set -e

echo "Starting Order Notification Backend..."

# Check if required environment variables are set
if [ -z "$NODE_ENV" ]; then
  export NODE_ENV=production
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Build the application
echo "Building application..."
npm run build

# Start the application
echo "Starting server..."
npm start