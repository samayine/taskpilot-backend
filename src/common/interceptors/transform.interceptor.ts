import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

/**
 * Wraps all successful responses in a consistent envelope:
 *   { success: true, data: <original response> }
 *
 * This mirrors the error format from HttpExceptionFilter:
 *   { success: false, statusCode, message, error, timestamp }
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
      })),
    );
  }
}
