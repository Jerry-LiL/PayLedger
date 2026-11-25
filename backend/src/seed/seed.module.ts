import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../entities/account.entity';
import { TransfersModule } from '../transfers/transfers.module';
import { WalletsModule } from '../wallets/wallets.module';
import { DemoSeedService } from './demo-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account]), WalletsModule, TransfersModule],
  providers: [DemoSeedService],
})
export class SeedModule {}
