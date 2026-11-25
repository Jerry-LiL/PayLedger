import { assertBalanced, balanceDelta, LedgerRuleError } from './ledger.rules';

const debit = (accountId: string, amount: number, currency = 'USD') => ({
  accountId,
  side: 'debit' as const,
  amount,
  currency,
});

const credit = (accountId: string, amount: number, currency = 'USD') => ({
  accountId,
  side: 'credit' as const,
  amount,
  currency,
});

describe('ledger rules', () => {
  it('accepts a transfer pair and a top-up pair', () => {
    expect(() => assertBalanced([debit('sender', 1500), credit('receiver', 1500)])).not.toThrow();
    expect(() => assertBalanced([debit('external', 5000), credit('wallet', 5000)])).not.toThrow();
  });

  it('accepts more than two lines when the totals match', () => {
    expect(() =>
      assertBalanced([debit('sender', 100), credit('receiver', 80), credit('fees', 20)]),
    ).not.toThrow();
  });

  it('rejects unbalanced, short, or non-positive lines', () => {
    expect(() => assertBalanced([debit('a', 100), credit('b', 90)])).toThrow(LedgerRuleError);
    expect(() => assertBalanced([debit('a', 100)])).toThrow(/at least two/);
    expect(() => assertBalanced([debit('a', 0), credit('b', 0)])).toThrow(/positive integers/);
    expect(() => assertBalanced([debit('a', -5), credit('b', -5)])).toThrow(/positive integers/);
    expect(() => assertBalanced([debit('a', 1.5), credit('b', 1.5)])).toThrow(/positive integers/);
  });

  it('rejects mixed currencies and a missing account', () => {
    expect(() => assertBalanced([debit('a', 10, 'USD'), credit('b', 10, 'EUR')])).toThrow(
      /single currency/,
    );
    expect(() => assertBalanced([debit('', 10), credit('b', 10)])).toThrow(/account/);
  });

  it('treats credits as an increase for a customer wallet', () => {
    expect(balanceDelta('credit', 500)).toBe(500);
    expect(balanceDelta('debit', 500)).toBe(-500);
  });
});
