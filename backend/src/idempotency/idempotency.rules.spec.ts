import { BadRequestException } from '@nestjs/common';
import { decideIdempotency, hashRequest, readIdempotencyKey } from './idempotency.rules';

describe('idempotency rules', () => {
  const record = {
    requestHash: 'abc',
    status: 'completed' as const,
    responseBody: { journalId: 'j1' },
  };

  it('proceeds when the key is new and replays a completed match', () => {
    expect(decideIdempotency(null, 'abc')).toEqual({ action: 'proceed' });
    expect(decideIdempotency(record, 'abc')).toEqual({
      action: 'replay',
      body: { journalId: 'j1' },
    });
  });

  it('conflicts when the payload differs or the first request is unfinished', () => {
    expect(decideIdempotency(record, 'other').action).toBe('conflict');
    expect(
      decideIdempotency({ ...record, status: 'in_progress', responseBody: null }, 'abc').action,
    ).toBe('conflict');
  });

  it('hashes the validated body, ignoring key order only when the caller fixes it', () => {
    const first = hashRequest('POST /transfers', { amount: 100, memo: null });
    const second = hashRequest('POST /transfers', { amount: 100, memo: null });
    const changed = hashRequest('POST /transfers', { amount: 101, memo: null });
    expect(first).toBe(second);
    expect(first).not.toBe(changed);
  });

  it('requires a client key of a usable length', () => {
    expect(readIdempotencyKey('  client-key-1  ')).toBe('client-key-1');
    expect(() => readIdempotencyKey('short')).toThrow(BadRequestException);
    expect(() => readIdempotencyKey(undefined)).toThrow(BadRequestException);
  });
});
