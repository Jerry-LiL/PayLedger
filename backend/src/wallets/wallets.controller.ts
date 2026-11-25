import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../common/page-query.dto';
import { CreateWalletDto, WalletResponseDto } from './wallet.dto';
import { WalletsService } from './wallets.service';

@ApiTags('wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Post()
  @HttpCode(201)
  @ApiCreatedResponse({ type: WalletResponseDto })
  create(@Body() dto: CreateWalletDto) {
    return this.wallets.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: WalletResponseDto, isArray: true })
  list() {
    return this.wallets.list();
  }

  @Get(':id')
  @ApiOkResponse({ type: WalletResponseDto })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.wallets.get(id);
  }

  @Get(':id/history')
  history(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) {
    return this.wallets.history(id, query.page, query.pageSize);
  }
}
