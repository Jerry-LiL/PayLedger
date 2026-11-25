export function formatCents(cents: number, currency = 'USD'): string {
  const amount = (Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = cents < 0 ? '-' : '';
  if (currency === 'USD') return `${sign}$${amount}`;
  return `${sign}${amount} ${currency}`;
}

export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100_000_000) return null;
  return cents;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
