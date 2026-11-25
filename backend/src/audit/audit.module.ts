import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditController } from './audit.controller';
import { AuditLogInterceptor } from './audit.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [
    AuditLogInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: AuditLogInterceptor },
  ],
})
export class AuditModule {}
