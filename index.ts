// src/index.ts - Main server entry point
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './utils/logger';
import { RedisService } from './services/redis.service';
import { KafkaService } from './services/kafka.service';
import { OrderService } from './services/order.service';
import { WebSocketService } from './services/websocket.service';
import { createWebhookRouter } from './routes/webhook';
import { createApiRouter } from './routes/api';

class Application {
  private app: express.Application;
  private server: any;
  private redisService: RedisService;
  private kafkaService: KafkaService;
  private orderService: OrderService;
  private websocketService: WebSocketService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    
    // Initialize services
    this.redisService = new RedisService();
    this.kafkaService = new KafkaService();
    this.orderService = new OrderService(this.kafkaService, this.redisService);
    this.websocketService = new WebSocketService(
      this.server, 
      this.redisService, 
      this.orderService
    );
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: config.cors.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: {
        error: 'Too many requests from this IP',
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
      });
      
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0',
      });
    });

    // API routes
    this.app.use('/api/webhook', createWebhookRouter(this.orderService));
    this.app.use('/api', createApiRouter(this.orderService, this.websocketService));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
      });
    });

    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        body: req.body,
      });

      res.status(500).json({
        error: 'Internal server error',
        message: config.nodeEnv === 'development' ? error.message : 'Something went wrong',
      });
    });
  }

  private async connectServices(): Promise<void> {
    try {
      logger.info('Connecting to external services...');

      // Connect to Redis
      await this.redisService.connect();
      logger.info('Redis connected successfully');

      // Connect to Kafka
      await this.kafkaService.connect();
      logger.info('Kafka connected successfully');

      // Start Kafka consumer
      await this.kafkaService.startConsumer();
      logger.info('Kafka consumer started successfully');

      logger.info('All services connected successfully');
    } catch (error) {
      logger.error('Failed to connect services', { error });
      throw error;
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Close HTTP server
        this.server.close(() => {
          logger.info('HTTP server closed');
        });

        // Shutdown WebSocket service
        this.websocketService.shutdown();

        // Disconnect services
        await this.kafkaService.disconnect();
        await this.redisService.disconnect();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error });
        process.exit(1);
      }
    };

    // Handle different termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGHUP', () => shutdown('SIGHUP'));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error });
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      shutdown('unhandledRejection');
    });
  }

  public async start(): Promise<void> {
    try {
      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();
      this.setupGracefulShutdown();

      // Connect to external services
      await this.connectServices();

      // Start HTTP server
      this.server.listen(config.port, () => {
        logger.info(`Server started successfully`, {
          port: config.port,
          nodeEnv: config.nodeEnv,
          corsOrigins: config.cors.origins,
        });
        
        console.log(`
🚀 Order Notification System is running!
📡 HTTP Server: http://localhost:${config.port}
🔌 WebSocket: ws://localhost:${config.port}
📊 Health Check: http://localhost:${config.port}/health
🪝 Webhook Endpoint: http://localhost:${config.port}/api/webhook/order
📈 API Endpoints: http://localhost:${config.port}/api/
        `);
      });

      // Health check interval
      setInterval(async () => {
        try {
          await this.websocketService.sendHealthUpdate();
        } catch (error) {
          logger.error('Health update failed', { error });
        }
      }, 30000); // Every 30 seconds

    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  }
}

// Start the application
const app = new Application();
app.start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

// Export for testing
export default app;