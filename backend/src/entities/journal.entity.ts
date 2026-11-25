import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { LedgerEntry } from './ledger-entry.entity';

export type JournalType = 'top_up' | 'transfer';

@Entity({ name: 'journals' })
export class Journal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'journal_type', type: 'varchar', length: 16 })
  journalType: JournalType;

  @Column({ type: 'varchar', length: 200, nullable: true })
  memo: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => LedgerEntry, (entry) => entry.journal)
  entries: LedgerEntry[];
}
