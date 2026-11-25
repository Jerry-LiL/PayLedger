import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Account } from '../entities/account.entity';
import { Journal, JournalType } from '../entities/journal.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { isUniqueViolation } from '../common/db-error';
import { assertBalanced, LedgerLine } from './ledger.rules';

export interface PostedJournal {
  id: string;
  journalType: JournalType;
  memo: string | null;
}

export interface JournalView {
  id: string;
  type: JournalType;
  memo: string | null;
  createdAt: string;
  entries: Array<{
    accountId: string;
    accountName: string;
    side: 'debit' | 'credit';
    amount: number;
    currency: string;
  }>;
}

export interface HistoryItem {
  journalId: string;
  type: JournalType;
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  memo: string | null;
  counterparty: { id: string; name: string } | null;
  createdAt: string;
}

export interface HistoryPage {
  page: number;
  pageSize: number;
  total: number;
  items: HistoryItem[];
}

export interface TrialBalanceRow {
  currency: string;
  debits: number;
  credits: number;
  balanced: boolean;
}

function rawField(row: Record<string, string>, name: string): string {
  return row[name] ?? row[name.toLowerCase()] ?? '0';
}

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(Journal) private readonly journals: Repository<Journal>,
    @InjectRepository(LedgerEntry) private readonly entries: Repository<LedgerEntry>,
  ) {}

  async ensureExternal(currency: string): Promise<Account> {
    const existing = await this.accounts.findOne({ where: { kind: 'external', currency } });
    if (existing) return existing;
    try {
      return await this.accounts.save(
        this.accounts.create({
          id: randomUUID(),
          kind: 'external',
          name: `External funding (${currency})`,
          email: null,
          currency,
        }),
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await this.accounts.findOne({ where: { kind: 'external', currency } });
      if (!raced) throw err;
      return raced;
    }
  }

  async externalAccount(manager: EntityManager, currency: string): Promise<Account> {
    const account = await manager.findOne(Account, { where: { kind: 'external', currency } });
    if (!account) {
      throw new NotFoundException(`No external funding account for ${currency}`);
    }
    return account;
  }

  async post(
    manager: EntityManager,
    input: { type: JournalType; memo: string | null; lines: LedgerLine[] },
  ): Promise<PostedJournal> {
    assertBalanced(input.lines);
    const journal = await manager.save(
      manager.create(Journal, {
        journalType: input.type,
        memo: input.memo,
      }),
    );
    const accounts = await Promise.all(
      input.lines.map((line) => manager.findOne(Account, { where: { id: line.accountId } })),
    );
    if (accounts.some((account) => !account)) {
      throw new NotFoundException('Ledger line refers to an unknown account');
    }
    await manager.save(
      input.lines.map((line, index) =>
        manager.create(LedgerEntry, {
          journal,
          account: accounts[index] as Account,
          side: line.side,
          amount: line.amount,
          currency: line.currency,
        }),
      ),
    );
    return { id: journal.id, journalType: journal.journalType, memo: journal.memo };
  }

  async balance(manager: EntityManager, accountId: string): Promise<number> {
    const raw = await manager
      .createQueryBuilder(LedgerEntry, 'entry')
      .innerJoin('entry.account', 'account')
      .select(
        `COALESCE(SUM(CASE WHEN entry.side = 'credit' THEN entry.amount ELSE -entry.amount END), 0)`,
        'balance',
      )
      .where('account.id = :accountId', { accountId })
      .getRawOne<Record<string, string>>();
    return Number(rawField(raw ?? {}, 'balance'));
  }

  async balancesFor(accountIds: string[]): Promise<Map<string, number>> {
    const balances = new Map(accountIds.map((id) => [id, 0]));
    if (accountIds.length === 0) return balances;
    const rows = await this.entries
      .createQueryBuilder('entry')
      .innerJoin('entry.account', 'account')
      .select('account.id', 'accountId')
      .addSelect(
        `COALESCE(SUM(CASE WHEN entry.side = 'credit' THEN entry.amount ELSE -entry.amount END), 0)`,
        'balance',
      )
      .where('account.id IN (:...accountIds)', { accountIds })
      .groupBy('account.id')
      .getRawMany<Record<string, string>>();
    for (const row of rows) {
      balances.set(rawField(row, 'accountId'), Number(rawField(row, 'balance')));
    }
    return balances;
  }

  async history(accountId: string, page: number, pageSize: number): Promise<HistoryPage> {
    const account = await this.accounts.findOne({ where: { id: accountId, kind: 'wallet' } });
    if (!account) throw new NotFoundException('Wallet not found');

    const total = await this.entries
      .createQueryBuilder('entry')
      .innerJoin('entry.account', 'account')
      .where('account.id = :accountId', { accountId })
      .getCount();

    const rows = await this.entries
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.journal', 'journal')
      .innerJoinAndSelect('entry.account', 'account')
      .where('account.id = :accountId', { accountId })
      .orderBy('entry.createdAt', 'DESC')
      .addOrderBy('entry.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const journalIds = rows.map((row) => row.journal.id);
    const related =
      journalIds.length === 0
        ? []
        : await this.entries
            .createQueryBuilder('entry')
            .innerJoinAndSelect('entry.journal', 'journal')
            .innerJoinAndSelect('entry.account', 'account')
            .where('journal.id IN (:...journalIds)', { journalIds })
            .getMany();

    const items: HistoryItem[] = rows.map((row) => {
      const other = related.find(
        (line) => line.journal.id === row.journal.id && line.account.id !== accountId,
      );
      return {
        journalId: row.journal.id,
        type: row.journal.journalType,
        direction: row.side === 'credit' ? 'in' : 'out',
        amount: row.amount,
        currency: row.currency,
        memo: row.journal.memo,
        counterparty: other ? { id: other.account.id, name: other.account.name } : null,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return { page, pageSize, total, items };
  }

  async getJournal(id: string): Promise<JournalView> {
    const journal = await this.journals.findOne({
      where: { id },
      relations: { entries: { account: true } },
    });
    if (!journal) throw new NotFoundException('Journal not found');
    return {
      id: journal.id,
      type: journal.journalType,
      memo: journal.memo,
      createdAt: journal.createdAt.toISOString(),
      entries: journal.entries.map((entry) => ({
        accountId: entry.account.id,
        accountName: entry.account.name,
        side: entry.side,
        amount: entry.amount,
        currency: entry.currency,
      })),
    };
  }

  async trialBalance(): Promise<TrialBalanceRow[]> {
    const rows = await this.entries
      .createQueryBuilder('entry')
      .select('entry.currency', 'currency')
      .addSelect(`COALESCE(SUM(CASE WHEN entry.side = 'debit' THEN entry.amount ELSE 0 END), 0)`, 'debits')
      .addSelect(
        `COALESCE(SUM(CASE WHEN entry.side = 'credit' THEN entry.amount ELSE 0 END), 0)`,
        'credits',
      )
      .groupBy('entry.currency')
      .orderBy('entry.currency', 'ASC')
      .getRawMany<Record<string, string>>();

    return rows.map((row) => {
      const debits = Number(rawField(row, 'debits'));
      const credits = Number(rawField(row, 'credits'));
      return {
        currency: rawField(row, 'currency').trim(),
        debits,
        credits,
        balanced: debits === credits,
      };
    });
  }
}
