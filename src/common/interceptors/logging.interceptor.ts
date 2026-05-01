import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";

/**
 * Global logging interceptor — logs every request with:
 * - HTTP method + URL
 * - User ID (if authenticated)
 * - Execution time in ms
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const userId = request.user?.userId || "anonymous";
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const elapsed = Date.now() - now;
        this.logger.log(
          `${method} ${url} — user: ${userId} — ${elapsed}ms`,
        );
      }),
    );
  }
}
