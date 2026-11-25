import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Observable, from, throwError } from 'rxjs';
import { catchError, concatMap, map, switchMap } from 'rxjs/operators';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

const HTTP_CODE_METADATA = '__httpCode__';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const path = (request.originalUrl ?? request.url).split('?')[0];
    if (!this.shouldRecord(path)) return next.handle();

    const started = Date.now();
    const successStatus =
      this.reflector.getAllAndOverride<number>(HTTP_CODE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 200;

    const write = (statusCode: number) =>
      this.write(request, path, statusCode, Date.now() - started);

    return next.handle().pipe(
      concatMap((data: unknown) => from(write(successStatus)).pipe(map(() => data))),
      catchError((err: unknown) =>
        from(write(err instanceof HttpException ? err.getStatus() : 500)).pipe(
          switchMap(() => throwError(() => err)),
        ),
      ),
    );
  }

  private shouldRecord(path: string): boolean {
    if (!path.startsWith('/api')) return false;
    if (path === '/api/health' || path.startsWith('/api/audit-logs')) return false;
    return true;
  }

  private async write(
    request: Request,
    path: string,
    statusCode: number,
    durationMs: number,
  ): Promise<void> {
    try {
      const header = request.headers['idempotency-key'];
      await this.logs.save(
        this.logs.create({
          method: request.method.slice(0, 8),
          path: path.slice(0, 200),
          statusCode,
          durationMs,
          ip: request.ip ?? null,
          idempotencyKey: typeof header === 'string' ? header.slice(0, 200) : null,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`Failed to write audit log: ${message}`);
    }
  }
}
