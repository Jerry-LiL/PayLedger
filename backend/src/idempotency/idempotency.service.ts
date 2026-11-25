import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { IdempotencyKey } from '../entities/idempotency-key.entity';
import { isUniqueViolation } from '../common/db-error';
import { decideIdempotency, IdempotencyDecision } from './idempotency.rules';

export interface IdempotentResult<T> {
  body: T;
  replayed: boolean;
}

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(IdempotencyKey) private readonly keys: Repository<IdempotencyKey>,
  ) {}

  /**
   * The key row and the ledger lines commit together. A retried key replays
   * the stored response. A failed attempt rolls the key back so the client
   * can try again with the same key.
   */
  async run<T extends object>(
    key: string,
    requestHash: string,
    handler: (manager: EntityManager) => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    const existing = await this.keys.findOne({ where: { key } });
    const upfront = decideIdempotency(existing, requestHash);
    if (upfront.action === 'conflict') throw new ConflictException(upfront.message);
    if (upfront.action === 'replay') return { body: upfront.body as T, replayed: true };

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const inserted = await this.insertKey(runner.manager, key, requestHash);
      if (inserted !== 'inserted') {
        await runner.rollbackTransaction();
        if (inserted.action === 'replay') return { body: inserted.body as T, replayed: true };
        if (inserted.action === 'conflict') throw new ConflictException(inserted.message);
        throw new ConflictException('A request with this Idempotency-Key is still in progress');
      }

      const body = await handler(runner.manager);
      const row = await runner.manager.findOneByOrFail(IdempotencyKey, { key });
      row.status = 'completed';
      row.responseStatus = 201;
      row.responseBody = body as Record<string, unknown>;
      await runner.manager.save(row);
      await runner.commitTransaction();
      return { body, replayed: false };
    } catch (err) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }
  }

  private async insertKey(
    manager: EntityManager,
    key: string,
    requestHash: string,
  ): Promise<IdempotencyDecision | 'inserted'> {
    // A unique violation aborts the surrounding transaction unless we
    // roll back to a savepoint first.
    await manager.query('SAVEPOINT idempotency_insert');
    try {
      await manager.save(
        manager.create(IdempotencyKey, {
          key,
          requestHash,
          status: 'in_progress',
          responseStatus: null,
          responseBody: null,
        }),
      );
      await manager.query('RELEASE SAVEPOINT idempotency_insert');
      return 'inserted';
    } catch (err) {
      await manager.query('ROLLBACK TO SAVEPOINT idempotency_insert');
      if (!isUniqueViolation(err)) throw err;
      const raced = await manager.findOne(IdempotencyKey, { where: { key } });
      const decision = decideIdempotency(raced, requestHash);
      if (decision.action === 'proceed') {
        return {
          action: 'conflict',
          message: 'A request with this Idempotency-Key is still in progress',
        };
      }
      return decision;
    }
  }
}
