import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { LedgerService } from './ledger.service';

class TrialBalanceRowDto {
  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 25000 })
  debits: number;

  @ApiProperty({ example: 25000 })
  credits: number;

  @ApiProperty({ example: true })
  balanced: boolean;
}

@ApiTags('ledger')
@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('ledger/trial-balance')
  @ApiOkResponse({ type: TrialBalanceRowDto, isArray: true })
  trialBalance() {
    return this.ledger.trialBalance();
  }

  @Get('journals/:id')
  journal(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ledger.getJournal(id);
  }
}
