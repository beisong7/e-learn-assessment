import { Prisma } from '@prisma/client';
import { HttpError } from './http-error.js';
import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFound: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: 'The requested API endpoint does not exist.' },
  });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      response
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'This record no longer exists.' } });
      return;
    }
    if (['P2002', 'P2003', 'P2034'].includes(error.code)) {
      response.status(409).json({
        error: {
          code: 'CONTENT_CONFLICT',
          message: 'The content changed or conflicts with another record. Reload and try again.',
        },
      });
      return;
    }
  }

  const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : null;
  if (type === 'entity.parse.failed') {
    response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body.' } });
    return;
  }
  if (type === 'entity.too.large') {
    response.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body exceeds the 100 KB limit.' },
    });
    return;
  }

  // Keep stack traces and request contents out of public responses.
  console.error('Unhandled API error');
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
};
