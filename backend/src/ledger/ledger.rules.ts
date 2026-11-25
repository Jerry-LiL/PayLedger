export type EntrySide = 'debit' | 'credit';

export interface LedgerLine {
  accountId: string;
  side: EntrySide;
  amount: number;
  currency: string;
}

export class LedgerRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerRuleError';
  }
}

/**
 * Every journal must balance: the sum of debit amounts equals the sum of
 * credit amounts, in one currency. Wallet accounts are liabilities, so a
 * credit increases the balance we owe the customer and a debit decreases it.
 */
export function assertBalanced(lines: LedgerLine[]): void {
  if (lines.length < 2) {
    throw new LedgerRuleError('A journal needs at least two lines');
  }

  let debits = 0;
  let credits = 0;
  const currencies = new Set<string>();

  for (const line of lines) {
    if (!line.accountId) {
      throw new LedgerRuleError('Every line needs an account');
    }
    if (!/^[A-Z]{3}$/.test(line.currency)) {
      throw new LedgerRuleError('Currency must be a 3-letter code');
    }
    if (!Number.isInteger(line.amount) || line.amount <= 0) {
      throw new LedgerRuleError('Amounts must be positive integers in minor units');
    }
    currencies.add(line.currency);
    if (line.side === 'debit') debits += line.amount;
    else if (line.side === 'credit') credits += line.amount;
    else throw new LedgerRuleError('Line side must be debit or credit');
  }

  if (currencies.size !== 1) {
    throw new LedgerRuleError('A journal must use a single currency');
  }
  if (debits !== credits) {
    throw new LedgerRuleError(`Debits ${debits} do not equal credits ${credits}`);
  }
}

export function balanceDelta(side: EntrySide, amount: number): number {
  return side === 'credit' ? amount : -amount;
}
