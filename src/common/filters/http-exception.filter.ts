import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

/**
 * Global exception filter — catches all HTTP exceptions and
 * returns a consistent JSON format:
 *
 * {
 *   "success": false,
 *   "statusCode": 400,
 *   "message": "...",
 *   "error": "Bad Request",
 *   "timestamp": "2026-05-01T..."
 * }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let error = "Internal Server Error";

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object") {
        const res = exceptionResponse as any;
        message = res.message || exception.message;
        error = res.error || "Error";
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      // Log unexpected errors with full stack trace
      this.logger.error(
        `Unexpected error on ${request.method} ${request.url}`,
        exception.stack,
      );
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}
