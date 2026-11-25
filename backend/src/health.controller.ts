import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

class HealthDto {
  @ApiProperty({ example: 'ok' })
  status: string;
}

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('health')
  @ApiOkResponse({ type: HealthDto })
  async health(): Promise<HealthDto> {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok' };
  }
}
