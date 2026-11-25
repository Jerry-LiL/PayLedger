import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Account } from '../entities/account.entity';
import { isUniqueViolation } from '../common/db-error';
import { HistoryPage, LedgerService } from '../ledger/ledger.service';
import { CreateWalletDto } from './wallet.dto';

export interface WalletView {
  id: string;
  name: string;
  email: string;
  currency: string;
  balance: number;
  createdAt: string;
}

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    private readonly ledger: LedgerService,
  ) {}

  async create(dto: CreateWalletDto): Promise<WalletView> {
    const currency = dto.currency ?? 'USD';
    await this.ledger.ensureExternal(currency);
    const account = this.accounts.create({
      id: randomUUID(),
      kind: 'wallet',
      name: dto.name,
      email: dto.email,
      currency,
    });
    try {
      await this.accounts.save(account);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('A wallet with this email already exists');
      }
      throw err;
    }
    return this.toView(account, 0);
  }

  async list(): Promise<WalletView[]> {
    const wallets = await this.accounts.find({
      where: { kind: 'wallet' },
      order: { createdAt: 'ASC' },
    });
    const balances = await this.ledger.balancesFor(wallets.map((wallet) => wallet.id));
    return wallets.map((wallet) => this.toView(wallet, balances.get(wallet.id) ?? 0));
  }

  async get(id: string): Promise<WalletView> {
    const wallet = await this.findWallet(id);
    const balance = await this.ledger.balance(this.accounts.manager, wallet.id);
    return this.toView(wallet, balance);
  }

  history(id: string, page: number, pageSize: number): Promise<HistoryPage> {
    return this.ledger.history(id, page, pageSize);
  }

  private async findWallet(id: string): Promise<Account> {
    const wallet = await this.accounts.findOne({ where: { id, kind: 'wallet' } });
    if (!wallet || !wallet.email) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  private toView(account: Account, balance: number): WalletView {
    return {
      id: account.id,
      name: account.name,
      email: account.email ?? '',
      currency: account.currency,
      balance,
      createdAt: account.createdAt.toISOString(),
    };
  }
}
