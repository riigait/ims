import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request { requestId: string }
  }
}

function log(level: 'info' | 'warn' | 'error', data: Record<string, unknown>) {
  console.log(JSON.stringify({ level, time: new Date().toISOString(), ...data }));
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log(level, {
      requestId: req.requestId,
      method:    req.method,
      path:      req.path,
      status:    res.statusCode,
      duration,
      userId:    (req as any).userId ?? null,
      ip:        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip,
    });
  });

  next();
}
