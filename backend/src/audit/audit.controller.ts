import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageQueryDto } from '../common/page-query.dto';
import { AuditLog } from '../entities/audit-log.entity';

class AuditLogDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  method: string;

  @ApiProperty()
  path: string;

  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  durationMs: number;

  @ApiProperty({ nullable: true })
  idempotencyKey: string | null;

  @ApiProperty()
  createdAt: Date;
}

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  @Get()
  @ApiOkResponse({ type: AuditLogDto, isArray: false })
  async list(@Query() query: PageQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.logs.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        method: item.method,
        path: item.path,
        statusCode: item.statusCode,
        durationMs: item.durationMs,
        ip: item.ip,
        idempotencyKey: item.idempotencyKey,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }
}
