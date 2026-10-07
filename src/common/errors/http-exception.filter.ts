import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ErrorCode,
  type ErrorResponseBody,
  type FieldError,
} from './error-codes.js';

const DEFAULT_CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.ValidationFailed,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.Unauthorized,
  [HttpStatus.FORBIDDEN]: ErrorCode.Forbidden,
  [HttpStatus.NOT_FOUND]: ErrorCode.NotFound,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TooManyRequests,
};

/**
 * 把所有例外轉成同一種 JSON 格式。
 * - 已知的 HttpException：保留狀態碼，補上 code
 * - 未預期的錯誤：一律 500，記 log，但不把內部細節回傳
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.InternalError;
    let message = 'Internal server error';
    let details: FieldError[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = DEFAULT_CODE_BY_STATUS[status] ?? `HTTP_${status}`;
      message = exception.message;

      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as {
          code?: string;
          message?: string | string[];
          details?: FieldError[];
        };
        code = b.code ?? code;
        if (typeof b.message === 'string') message = b.message;
        details = b.details;
      }
    } else {
      this.logger.error(
        `Unhandled error on ${req.method} ${req.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ErrorResponseBody = {
      statusCode: status,
      code,
      message,
      ...(details?.length ? { details } : {}),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(payload);
  }
}
