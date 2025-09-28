import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    permissions: string[];
  };
}

// Simple API key authentication middleware
export const authenticateApiKey = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');
  
  if (!apiKey) {
    logger.warn('Authentication failed: No API key provided', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
    });
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required',
    });
  }

  // In production, validate against a database or external service
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || ['dev-key-12345'];
  
  if (!validApiKeys.includes(apiKey)) {
    logger.warn('Authentication failed: Invalid API key', {
      apiKey: apiKey.substring(0, 8) + '...',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
    });
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
  }

  // Set user context (in production, fetch from database)
  req.user = {
    id: 'system-user',
    role: 'admin',
    permissions: ['read:orders', 'write:orders', 'read:metrics'],
  };

  logger.debug('User authenticated', {
    userId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  next();
};

// Optional authentication (doesn't fail if no key provided)
export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');
  
  if (apiKey) {
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || ['dev-key-12345'];
    
    if (validApiKeys.includes(apiKey)) {
      req.user = {
        id: 'system-user',
        role: 'admin',
        permissions: ['read:orders', 'write:orders', 'read:metrics'],
      };
    }
  }
  
  next();
};

// Role-based authorization middleware
export const requireRole = (requiredRole: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      logger.warn('Authorization failed: Insufficient role', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRole,
        url: req.url,
      });
      
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${requiredRole}' required`,
      });
    }

    next();
  };
};

// Permission-based authorization middleware
export const requirePermission = (requiredPermission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!req.user.permissions.includes(requiredPermission)) {
      logger.warn('Authorization failed: Insufficient permissions', {
        userId: req.user.id,
        userPermissions: req.user.permissions,
        requiredPermission,
        url: req.url,
      });
      
      return res.status(403).json({
        error: 'Forbidden',
        message: `Permission '${requiredPermission}' required`,
      });
    }

    next();
  };
};

// Webhook signature verification (for secure webhook endpoints)
export const verifyWebhookSignature = (secret: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.header('X-Webhook-Signature') || req.header('X-Hub-Signature');
    
    if (!signature) {
      logger.warn('Webhook signature missing', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Webhook signature required',
      });
    }

    // In production, implement proper HMAC verification
    // const crypto = require('crypto');
    // const computedSignature = crypto
    //   .createHmac('sha256', secret)
    //   .update(JSON.stringify(req.body))
    //   .digest('hex');
    
    // For development, accept any signature
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Webhook signature verified (development mode)');
      return next();
    }

    // Simple signature check for demo
    if (signature === `sha256=${secret}`) {
      logger.debug('Webhook signature verified');
      return next();
    }

    logger.warn('Webhook signature verification failed', {
      providedSignature: signature,
      ip: req.ip,
    });

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid webhook signature',
    });
  };
};

// Rate limiting per user/API key
export const userRateLimit = (maxRequests: number = 100, windowMinutes: number = 15) => {
  const userRequestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const identifier = req.user?.id || req.ip;
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;

    const userLimits = userRequestCounts.get(identifier);

    if (!userLimits || now > userLimits.resetTime) {
      userRequestCounts.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (userLimits.count >= maxRequests) {
      logger.warn('User rate limit exceeded', {
        identifier,
        count: userLimits.count,
        maxRequests,
        resetTime: new Date(userLimits.resetTime).toISOString(),
      });

      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'User rate limit exceeded',
        retryAfter: Math.ceil((userLimits.resetTime - now) / 1000),
      });
    }

    userLimits.count++;
    next();
  };
};