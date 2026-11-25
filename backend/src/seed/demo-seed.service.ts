import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../entities/account.entity';
import { TransfersService } from '../transfers/transfers.service';
import { WalletsService } from '../wallets/wallets.service';

@Injectable()
export class DemoSeedService implements OnModuleInit {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    private readonly wallets: WalletsService,
    private readonly transfers: TransfersService,
  ) {}

  async onModuleInit(): Promise<void> {
    if ((this.config.get<string>('SEED_DEMO') ?? 'true') !== 'true') return;
    const existing = await this.accounts.count({ where: { kind: 'wallet' } });
    if (existing > 0) return;

    const maya = await this.wallets.create({
      name: 'Maya Chen',
      email: 'maya@example.com',
      currency: 'USD',
    });
    const luis = await this.wallets.create({
      name: 'Luis Ortega',
      email: 'luis@example.com',
      currency: 'USD',
    });

    await this.transfers.topUp(
      { walletId: maya.id, amount: 25000, memo: 'Opening balance' },
      'seed-maya-opening',
    );

    const payments: Array<{ amount: number; memo: string; key: string }> = [
      { amount: 1800, memo: 'Dinner', key: 'seed-dinner' },
      { amount: 2400, memo: 'Rent share', key: 'seed-rent' },
      { amount: 650, memo: 'Groceries', key: 'seed-groceries' },
      { amount: 1500, memo: 'Train ticket', key: 'seed-train' },
      { amount: 900, memo: 'Coffee club', key: 'seed-coffee' },
    ];
    for (const payment of payments) {
      await this.transfers.transfer(
        {
          fromWalletId: maya.id,
          toWalletId: luis.id,
          amount: payment.amount,
          memo: payment.memo,
        },
        payment.key,
      );
    }

    this.logger.log('Seeded demo wallets for Maya Chen and Luis Ortega');
  }
}
