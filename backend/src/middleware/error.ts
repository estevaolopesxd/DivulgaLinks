import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  // Log the error
  logger.error('Request error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
  });

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // App-specific errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        res.status(409).json({
          error: 'A record with this data already exists',
          field: (err.meta as any)?.target,
        });
        return;
      case 'P2025':
        res.status(404).json({ error: 'Record not found' });
        return;
      case 'P2003':
        res.status(400).json({ error: 'Foreign key constraint failed' });
        return;
      default:
        res.status(500).json({ error: 'Database error', code: err.code });
        return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Invalid data provided to the database' });
    return;
  }

  // Default: Internal server error
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    error: 'Internal server error',
    ...(isDev && { message: err.message, stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
};
