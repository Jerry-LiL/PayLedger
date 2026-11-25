import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Account } from './account.entity';
import { Journal } from './journal.entity';
import type { EntrySide } from '../ledger/ledger.rules';

@Entity({ name: 'ledger_entries' })
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Journal, (journal) => journal.entries, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_id' })
  journal: Journal;

  @ManyToOne(() => Account, { nullable: false })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ type: 'varchar', length: 6 })
  side: EntrySide;

  @Column({ type: 'integer' })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
