import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type IdempotencyStatus = 'in_progress' | 'completed';

@Entity({ name: 'idempotency_keys' })
export class IdempotencyKey {
  @PrimaryColumn({ type: 'varchar', length: 200 })
  key: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string;

  @Column({ type: 'varchar', length: 16 })
  status: IdempotencyStatus;

  @Column({ name: 'response_status', type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
