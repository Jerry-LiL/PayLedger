import { Body, Controller, Headers, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { readIdempotencyKey } from '../idempotency/idempotency.rules';
import { MovementResponseDto, TopUpDto, TransferDto } from './transfer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('transfers')
@ApiSecurity('Idempotency-Key')
@ApiHeader({
  name: 'Idempotency-Key',
  required: true,
  description: 'Client-generated key. Repeating it with the same body replays the original journal.',
})
@Controller()
@UseGuards(ThrottlerGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post('top-ups')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add funds to a wallet from the external funding account' })
  @ApiCreatedResponse({ type: MovementResponseDto })
  async topUp(
    @Body() dto: TopUpDto,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.transfers.topUp(dto, readIdempotencyKey(key));
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }

  @Post('transfers')
  @HttpCode(201)
  @ApiOperation({ summary: 'Move funds from one wallet to another' })
  @ApiCreatedResponse({ type: MovementResponseDto })
  async transfer(
    @Body() dto: TransferDto,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.transfers.transfer(dto, readIdempotencyKey(key));
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }
}
