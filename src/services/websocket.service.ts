// src/services/websocket.service.ts

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { RedisService } from './redis.service';
import { OrderService } from './order.service';
import { logger } from '../utils/logger';
import { Order, Metrics } from '../types';

export class WebSocketService {
  private io: SocketIOServer;
  private redisService: RedisService;
  private orderService: OrderService;
  private connectedClients = new Map<string, Socket>();
  private metricsInterval?: NodeJS.Timer;

  constructor(httpServer: HTTPServer, redisService: RedisService, orderService: OrderService) {
    this.redisService = redisService;
    this.orderService = orderService;
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    this.setupRedisSubscriptions();
    this.startMetricsBroadcast();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const clientId = socket.id;
      this.connectedClients.set(clientId, socket);

      logger.info('WebSocket client connected', {
        clientId,
        totalClients: this.connectedClients.size,
        clientIP: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
      });

      // Send initial data to newly connected client
      this.sendInitialData(socket);

      // Handle client subscription to specific channels
      socket.on('subscribe', (channels: string[]) => {
        this.handleSubscription(socket, channels);
      });

      // Handle client unsubscription
      socket.on('unsubscribe', (channels: string[]) => {
        this.handleUnsubscription(socket, channels);
      });

      // Handle client requesting order details
      socket.on('get-order', async (orderId: string) => {
        await this.handleGetOrder(socket, orderId);
      });

      // Handle client requesting metrics
      socket.on('get-metrics', async () => {
        await this.handleGetMetrics(socket);
      });

      // Handle client requesting recent orders
      socket.on('get-recent-orders', async (limit: number = 20) => {
        await this.handleGetRecentOrders(socket, limit);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Handle disconnection
      socket.on('disconnect', (reason: string) => {
        this.connectedClients.delete(clientId);
        logger.info('WebSocket client disconnected', {
          clientId,
          reason,
          totalClients: this.connectedClients.size,
        });
      });

      // Handle connection errors
      socket.on('error', (error: Error) => {
        logger.error('WebSocket client error', {
          clientId,
          error: error.message,
          stack: error.stack,
        });
      });
    });

    // Handle server-level errors
    this.io.on('error', (error: Error) => {
      logger.error('WebSocket server error', { error });
    });
  }

  private async sendInitialData(socket: Socket): Promise<void> {
    try {
      // Send current metrics
      const metrics = await this.orderService.getMetrics();
      socket.emit('metrics-update', {
        type: 'METRICS_UPDATE',
        metrics,
        timestamp: new Date().toISOString(),
      });

      // Send recent orders
      const recentOrders = await this.orderService.getRecentOrders(10);
      socket.emit('initial-orders', {
        type: 'INITIAL_ORDERS',
        orders: recentOrders,
        timestamp: new Date().toISOString(),
      });

      // Send connection status
      socket.emit('connection-status', {
        type: 'CONNECTION_STATUS',
        status: 'connected',
        serverId: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
      });

      logger.debug('Initial data sent to client', { clientId: socket.id });
    } catch (error) {
      logger.error('Failed to send initial data', {
        clientId: socket.id,
        error,
      });
    }
  }

  private handleSubscription(socket: Socket, channels: string[]): void {
    channels.forEach(channel => {
      socket.join(channel);
      logger.debug('Client subscribed to channel', {
        clientId: socket.id,
        channel,
      });
    });

    socket.emit('subscription-confirmed', {
      channels,
      timestamp: new Date().toISOString(),
    });
  }

  private handleUnsubscription(socket: Socket, channels: string[]): void {
    channels.forEach(channel => {
      socket.leave(channel);
      logger.debug('Client unsubscribed from channel', {
        clientId: socket.id,
        channel,
      });
    });

    socket.emit('unsubscription-confirmed', {
      channels,
      timestamp: new Date().toISOString(),
    });
  }

  private async handleGetOrder(socket: Socket, orderId: string): Promise<void> {
    try {
      const order = await this.orderService.getOrder(orderId);
      
      socket.emit('order-details', {
        type: 'ORDER_DETAILS',
        orderId,
        order,
        found: !!order,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get order for WebSocket client', {
        clientId: socket.id,
        orderId,
        error,
      });

      socket.emit('error', {
        type: 'ORDER_FETCH_ERROR',
        orderId,
        message: 'Failed to retrieve order',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleGetMetrics(socket: Socket): Promise<void> {
    try {
      const metrics = await this.orderService.getMetrics();
      const processingStats = await this.orderService.getProcessingStats();
      
      socket.emit('metrics-details', {
        type: 'METRICS_DETAILS',
        metrics,
        processingStats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get metrics for WebSocket client', {
        clientId: socket.id,
        error,
      });

      socket.emit('error', {
        type: 'METRICS_FETCH_ERROR',
        message: 'Failed to retrieve metrics',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleGetRecentOrders(socket: Socket, limit: number): Promise<void> {
    try {
      const maxLimit = 50;
      const actualLimit = Math.min(limit, maxLimit);
      const orders = await this.orderService.getRecentOrders(actualLimit);
      
      socket.emit('recent-orders', {
        type: 'RECENT_ORDERS',
        orders,
        count: orders.length,
        limit: actualLimit,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get recent orders for WebSocket client', {
        clientId: socket.id,
        limit,
        error,
      });

      socket.emit('error', {
        type: 'ORDERS_FETCH_ERROR',
        message: 'Failed to retrieve recent orders',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private setupRedisSubscriptions(): void {
    // Subscribe to order updates
    this.redisService.subscribeToOrderUpdates((order: Order) => {
      this.broadcastOrderUpdate(order);
    });

    logger.info('WebSocket service subscribed to Redis channels');
  }

  private startMetricsBroadcast(): void {
    // Broadcast metrics every 10 seconds
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.orderService.getMetrics();
        this.broadcastMetrics(metrics);
      } catch (error) {
        logger.error('Failed to broadcast metrics', { error });
      }
    }, 10000);

    logger.info('Started metrics broadcast interval');
  }

  public broadcastOrderUpdate(order: Order): void {
    const message = {
      type: 'ORDER_UPDATE',
      order,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all connected clients
    this.io.emit('order-update', message);

    // Also broadcast to specific rooms if needed
    this.io.to('order-updates').emit('order-update', message);

    logger.debug('Broadcasted order update', {
      orderId: order.id,
      status: order.status,
      connectedClients: this.connectedClients.size,
    });
  }

  public broadcastMetrics(metrics: Metrics): void {
    const message = {
      type: 'METRICS_UPDATE',
      metrics,
      timestamp: new Date().toISOString(),
    };

    this.io.emit('metrics-update', message);
    this.io.to('metrics').emit('metrics-update', message);

    logger.debug('Broadcasted metrics update', {
      totalOrders: metrics.totalOrders,
      connectedClients: this.connectedClients.size,
    });
  }

  public broadcastSystemAlert(alert: { level: 'info' | 'warning' | 'error'; message: string; details?: any }): void {
    const message = {
      type: 'SYSTEM_ALERT',
      alert,
      timestamp: new Date().toISOString(),
    };

    this.io.emit('system-alert', message);
    
    logger.info('Broadcasted system alert', {
      level: alert.level,
      message: alert.message,
      connectedClients: this.connectedClients.size,
    });
  }

  public getConnectionStats(): { totalConnections: number; activeConnections: number } {
    return {
      totalConnections: this.connectedClients.size,
      activeConnections: this.connectedClients.size, // In this simple implementation, they're the same
    };
  }

  public async sendHealthUpdate(): Promise<void> {
    try {
      const health = await this.orderService.healthCheck();
      const connectionStats = this.getConnectionStats();
      
      const healthMessage = {
        type: 'HEALTH_UPDATE',
        health: {
          ...health,
          websocket: {
            status: 'healthy',
            connections: connectionStats,
          },
        },
        timestamp: new Date().toISOString(),
      };

      this.io.emit('health-update', healthMessage);
    } catch (error) {
      logger.error('Failed to send health update', { error });
    }
  }

  public shutdown(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Notify all clients of shutdown
    this.io.emit('server-shutdown', {
      type: 'SERVER_SHUTDOWN',
      message: 'Server is shutting down',
      timestamp: new Date().toISOString(),
    });

    // Close all connections
    this.io.close();
    
    logger.info('WebSocket service shut down');
  }

  // Method to send custom events to specific clients or rooms
  public sendToClient(clientId: string, event: string, data: any): void {
    const socket = this.connectedClients.get(clientId);
    if (socket) {
      socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  public sendToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  // Method to get client information
  public getClientInfo(): Array<{ id: string; connected: boolean; rooms: string[] }> {
    const clients: Array<{ id: string; connected: boolean; rooms: string[] }> = [];
    
    this.connectedClients.forEach((socket, id) => {
      clients.push({
        id,
        connected: socket.connected,
        rooms: Array.from(socket.rooms),
      });
    });

    return clients;
  }
}