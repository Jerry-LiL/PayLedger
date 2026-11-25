import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const MAX_MINOR = 100_000_000;

export class TopUpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  walletId: string;

  @ApiProperty({ description: 'Amount in minor units (cents).', example: 5000, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  amount: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

export class TransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fromWalletId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  toWalletId: string;

  @ApiProperty({ description: 'Amount in minor units (cents).', example: 1500, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  amount: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

export class MovementResponseDto {
  @ApiProperty()
  journalId: string;

  @ApiProperty({ enum: ['top_up', 'transfer'] })
  type: 'top_up' | 'transfer';

  @ApiProperty()
  amount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty()
  debitAccountId: string;

  @ApiProperty()
  creditAccountId: string;

  @ApiProperty({ nullable: true })
  memo: string | null;
}
