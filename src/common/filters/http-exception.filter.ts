import * as Sentry from '@sentry/node';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly isProduction: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    let status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    let overrideMessage: string | null = null;

    if (isHttpException && exception.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      overrideMessage = 'File exceeds size limit';
    }

    if (!isHttpException) {
      this.logger.error({ event: 'UNHANDLED_EXCEPTION', url: request.url, method: request.method, exception });
      Sentry.captureException(exception, { extra: { url: request.url, method: request.method } });
    }

    if (this.isProduction && status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    if (isHttpException) {
      if (overrideMessage) {
        response.status(status).json({
          statusCode: status,
          message: overrideMessage,
          timestamp: new Date().toISOString(),
          path: request.url,
        });
        return;
      }

      const payload = exception.getResponse();
      response.status(status).json(
        typeof payload === 'string'
          ? {
              statusCode: status,
              message: payload,
              timestamp: new Date().toISOString(),
              path: request.url,
            }
          : payload,
      );
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
