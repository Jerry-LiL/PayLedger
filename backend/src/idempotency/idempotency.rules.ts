import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';

export interface StoredIdempotency {
  requestHash: string;
  status: 'in_progress' | 'completed';
  responseBody: unknown;
}

export type IdempotencyDecision =
  | { action: 'proceed' }
  | { action: 'replay'; body: unknown }
  | { action: 'conflict'; message: string };

export function decideIdempotency(
  record: StoredIdempotency | null,
  requestHash: string,
): IdempotencyDecision {
  if (!record) return { action: 'proceed' };
  if (record.requestHash !== requestHash) {
    return {
      action: 'conflict',
      message: 'Idempotency-Key was already used with a different request',
    };
  }
  if (record.status !== 'completed' || record.responseBody == null) {
    return {
      action: 'conflict',
      message: 'A request with this Idempotency-Key is still in progress',
    };
  }
  return { action: 'replay', body: record.responseBody };
}

export function hashRequest(route: string, body: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify({ route, body })).digest('hex');
}

export function readIdempotencyKey(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  const key = value?.trim() ?? '';
  if (key.length < 8 || key.length > 200) {
    throw new BadRequestException('Idempotency-Key header must be between 8 and 200 characters');
  }
  return key;
}
