import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health.controller';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { LedgerModule } from './ledger/ledger.module';
import { SeedModule } from './seed/seed.module';
import { TransfersModule } from './transfers/transfers.module';
import { WalletsModule } from './wallets/wallets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const database = config.get<string>('DB_NAME', 'payledger');
        const dropSchema = config.get<string>('NODE_ENV') === 'test';
        if (dropSchema && !database.endsWith('_test')) {
          throw new Error(`Refusing to drop schema of non-test database "${database}"`);
        }
        return {
          type: 'postgres' as const,
          host: config.get<string>('DB_HOST', 'localhost'),
          port: Number(config.get<string>('DB_PORT', '5432')),
          username: config.get<string>('DB_USER', 'payledger'),
          password: config.get<string>('DB_PASSWORD', 'payledger'),
          database,
          autoLoadEntities: true,
          synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
          dropSchema,
          logging: config.get<string>('DB_LOGGING', 'false') === 'true',
          retryAttempts: dropSchema ? 1 : 10,
          retryDelay: 3000,
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get<string>('THROTTLE_TTL_MS', '60000')),
            limit: Number(config.get<string>('THROTTLE_SENSITIVE_LIMIT', '10')),
          },
        ],
      }),
    }),
    LedgerModule,
    IdempotencyModule,
    WalletsModule,
    TransfersModule,
    AuditModule,
    SeedModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
