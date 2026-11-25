export interface Wallet {
  id: string;
  name: string;
  email: string;
  currency: string;
  balance: number;
  createdAt: string;
}

export interface HistoryItem {
  journalId: string;
  type: 'top_up' | 'transfer';
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  memo: string | null;
  counterparty: { id: string; name: string } | null;
  createdAt: string;
}

export interface HistoryPage {
  page: number;
  pageSize: number;
  total: number;
  items: HistoryItem[];
}

export interface TrialRow {
  currency: string;
  debits: number;
  credits: number;
  balanced: boolean;
}

export interface Movement {
  journalId: string;
  type: 'top_up' | 'transfer';
  amount: number;
  currency: string;
  memo: string | null;
}

export interface ApiResult<T> {
  data: T;
  replayed: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? (payload as { message: unknown }).message
        : response.statusText;
    const textMessage = Array.isArray(message) ? message.join(', ') : String(message);
    throw new Error(textMessage);
  }
  return {
    data: payload as T,
    replayed: response.headers.get('Idempotent-Replayed') === 'true',
  };
}

export function listWallets(): Promise<ApiResult<Wallet[]>> {
  return request<Wallet[]>('/api/wallets');
}

export function createWallet(input: {
  name: string;
  email: string;
  currency: string;
}): Promise<ApiResult<Wallet>> {
  return request<Wallet>('/api/wallets', { method: 'POST', body: JSON.stringify(input) });
}

export function topUp(
  input: { walletId: string; amount: number; memo?: string },
  idempotencyKey: string,
): Promise<ApiResult<Movement>> {
  return request<Movement>('/api/top-ups', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function transfer(
  input: { fromWalletId: string; toWalletId: string; amount: number; memo?: string },
  idempotencyKey: string,
): Promise<ApiResult<Movement>> {
  return request<Movement>('/api/transfers', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function walletHistory(walletId: string, page: number, pageSize: number): Promise<ApiResult<HistoryPage>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request<HistoryPage>(`/api/wallets/${walletId}/history?${params.toString()}`);
}

export function trialBalance(): Promise<ApiResult<TrialRow[]>> {
  return request<TrialRow[]>('/api/ledger/trial-balance');
}
