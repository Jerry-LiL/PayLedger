import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type AccountKind = 'wallet' | 'external';

@Entity({ name: 'accounts' })
export class Account {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  kind: AccountKind;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 180, unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
