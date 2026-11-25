import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Account } from '../entities/account.entity';
import { Journal } from '../entities/journal.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { ensureLedgerSchema } from './ensure-ledger-schema';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account, Journal, LedgerEntry])],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await ensureLedgerSchema(this.dataSource);
    await this.ledger.ensureExternal('USD');
  }
}
