import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Account } from '../entities/account.entity';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { hashRequest } from '../idempotency/idempotency.rules';
import { LedgerService } from '../ledger/ledger.service';
import { TopUpDto, TransferDto } from './transfer.dto';

export interface MovementView {
  journalId: string;
  type: 'top_up' | 'transfer';
  amount: number;
  currency: string;
  debitAccountId: string;
  creditAccountId: string;
  memo: string | null;
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  topUp(dto: TopUpDto, key: string) {
    const hash = hashRequest('POST /top-ups', {
      walletId: dto.walletId,
      amount: dto.amount,
      memo: dto.memo ?? null,
    });
    return this.idempotency.run(key, hash, (manager) => this.applyTopUp(manager, dto));
  }

  transfer(dto: TransferDto, key: string) {
    const hash = hashRequest('POST /transfers', {
      fromWalletId: dto.fromWalletId,
      toWalletId: dto.toWalletId,
      amount: dto.amount,
      memo: dto.memo ?? null,
    });
    return this.idempotency.run(key, hash, (manager) => this.applyTransfer(manager, dto));
  }

  private async applyTopUp(manager: EntityManager, dto: TopUpDto): Promise<MovementView> {
    const wallet = await this.lockWallet(manager, dto.walletId);
    const external = await this.ledger.externalAccount(manager, wallet.currency);
    const journal = await this.ledger.post(manager, {
      type: 'top_up',
      memo: dto.memo ?? null,
      lines: [
        { accountId: external.id, side: 'debit', amount: dto.amount, currency: wallet.currency },
        { accountId: wallet.id, side: 'credit', amount: dto.amount, currency: wallet.currency },
      ],
    });
    return {
      journalId: journal.id,
      type: 'top_up',
      amount: dto.amount,
      currency: wallet.currency,
      debitAccountId: external.id,
      creditAccountId: wallet.id,
      memo: dto.memo ?? null,
    };
  }

  private async applyTransfer(manager: EntityManager, dto: TransferDto): Promise<MovementView> {
    if (dto.fromWalletId === dto.toWalletId) {
      throw new BadRequestException('Cannot transfer a wallet to itself');
    }

    // Lock in id order so two in-flight transfers cannot deadlock on the same pair.
    const locked = await this.lockWallets(manager, [dto.fromWalletId, dto.toWalletId]);
    const from = locked.get(dto.fromWalletId) as Account;
    const to = locked.get(dto.toWalletId) as Account;
    if (from.currency !== to.currency) {
      throw new BadRequestException('Wallets must use the same currency');
    }

    const available = await this.ledger.balance(manager, from.id);
    if (available < dto.amount) {
      throw new UnprocessableEntityException(
        `Insufficient funds: available ${available}, requested ${dto.amount}`,
      );
    }

    const journal = await this.ledger.post(manager, {
      type: 'transfer',
      memo: dto.memo ?? null,
      lines: [
        { accountId: from.id, side: 'debit', amount: dto.amount, currency: from.currency },
        { accountId: to.id, side: 'credit', amount: dto.amount, currency: to.currency },
      ],
    });
    return {
      journalId: journal.id,
      type: 'transfer',
      amount: dto.amount,
      currency: from.currency,
      debitAccountId: from.id,
      creditAccountId: to.id,
      memo: dto.memo ?? null,
    };
  }

  private async lockWallets(manager: EntityManager, ids: string[]): Promise<Map<string, Account>> {
    const locked = new Map<string, Account>();
    for (const id of [...ids].sort()) {
      locked.set(id, await this.lockWallet(manager, id));
    }
    return locked;
  }

  private async lockWallet(manager: EntityManager, id: string): Promise<Account> {
    const account = await manager.findOne(Account, {
      where: { id, kind: 'wallet' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!account) throw new NotFoundException(`Wallet ${id} not found`);
    return account;
  }
}
