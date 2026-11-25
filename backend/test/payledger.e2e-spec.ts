import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Account } from '../src/entities/account.entity';
import { Journal } from '../src/entities/journal.entity';
import { LedgerEntry } from '../src/entities/ledger-entry.entity';
import { createApp } from './create-app';

interface WalletBody {
  id: string;
  balance: number;
  currency: string;
  email: string;
}

interface MovementBody {
  journalId: string;
  type: string;
  amount: number;
  debitAccountId: string;
  creditAccountId: string;
}

interface JournalBody {
  entries: Array<{ side: string; amount: number }>;
}

interface HistoryBody {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{ journalId: string; direction: string; amount: number; memo: string | null }>;
}

async function openWallet(
  app: INestApplication,
  email: string,
  currency = 'USD',
): Promise<WalletBody> {
  const response = await request(app.getHttpServer())
    .post('/api/wallets')
    .send({ name: email.split('@')[0], email, currency })
    .expect(201);
  return response.body as WalletBody;
}

describe('PayLedger API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a wallet at a zero balance and rejects a duplicate email', async () => {
    const wallet = await openWallet(app, 'ada@example.com');
    expect(wallet.balance).toBe(0);
    expect(wallet.currency).toBe('USD');

    await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ name: 'Ada Again', email: 'ada@example.com' })
      .expect(409);

    const listed = await request(app.getHttpServer()).get('/api/wallets').expect(200);
    const emails = (listed.body as WalletBody[]).map((item) => item.email);
    expect(emails).toContain('ada@example.com');
    expect(emails.every((email) => !email.includes('funding'))).toBe(true);
  });

  it('tops up through a balanced journal and replays the same idempotency key', async () => {
    const wallet = await openWallet(app, 'topup@example.com');
    const payload = { walletId: wallet.id, amount: 5000, memo: 'cash' };

    const first = await request(app.getHttpServer())
      .post('/api/top-ups')
      .set('Idempotency-Key', 'topup-ada-0001')
      .send(payload)
      .expect(201);
    const again = await request(app.getHttpServer())
      .post('/api/top-ups')
      .set('Idempotency-Key', 'topup-ada-0001')
      .send(payload)
      .expect(201);

    const movement = first.body as MovementBody;
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect((again.body as MovementBody).journalId).toBe(movement.journalId);

    const journal = await request(app.getHttpServer())
      .get(`/api/journals/${movement.journalId}`)
      .expect(200);
    const entries = (journal.body as JournalBody).entries;
    const debits = entries.filter((entry) => entry.side === 'debit').reduce((sum, entry) => sum + entry.amount, 0);
    const credits = entries.filter((entry) => entry.side === 'credit').reduce((sum, entry) => sum + entry.amount, 0);
    expect(entries).toHaveLength(2);
    expect(debits).toBe(5000);
    expect(credits).toBe(5000);

    const reloaded = await request(app.getHttpServer()).get(`/api/wallets/${wallet.id}`).expect(200);
    expect((reloaded.body as WalletBody).balance).toBe(5000);
  });

  it('rejects a reused key with a different body and a missing key', async () => {
    const wallet = await openWallet(app, 'keys@example.com');
    await request(app.getHttpServer())
      .post('/api/top-ups')
      .set('Idempotency-Key', 'topup-keys-0001')
      .send({ walletId: wallet.id, amount: 2000 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/top-ups')
      .set('Idempotency-Key', 'topup-keys-0001')
      .send({ walletId: wallet.id, amount: 3000 })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/top-ups')
      .send({ walletId: wallet.id, amount: 100 })
      .expect(400);

    const reloaded = await request(app.getHttpServer()).get(`/api/wallets/${wallet.id}`).expect(200);
    expect((reloaded.body as WalletBody).balance).toBe(2000);
  });

  it('moves funds between wallets and keeps each currency in balance', async () => {
    const from = await openWallet(app, 'from@example.com');
    const to = await openWallet(app, 'to@example.com');
    await request(app.getHttpServer())
      .post('/api/top-ups')
      .set('Idempotency-Key', 'fund-from-0001')
      .send({ walletId: from.id, amount: 4000 })
      .expect(201);

    const moved = await request(app.getHttpServer())
      .post('/api/transfers')
      .set('Idempotency-Key', 'transfer-rent-0001')
      .send({ fromWalletId: from.id, toWalletId: to.id, amount: 1500, memo: 'rent' })
      .expect(201);

    expect((moved.body as MovementBody).type).toBe('transfer');
    const sender = await request(app.getHttpServer()).get(`/api/wallets/${from.id}`).expect(200);
    const receiver = await request(app.getHttpServer()).get(`/api/wallets/${to.id}`).expect(200);
    expect((sender.body as WalletBody).balance).toBe(2500);
    expect((receiver.body as WalletBody).balance).toBe(1500);

    const books = await request(app.getHttpServer()).get('/api/ledger/trial-balance').expect(200);
    for (const row of books.body as Array<{ balanced: boolean }>) {
      expect(row.balanced).toBe(true);
    }
  });

  it('leaves balances unchanged when funds are short or the transfer is invalid', async () => {
    const from = await openWallet(app, 'short@example.com');
    const to = await openWallet(app, 'other@example.com');
    const eur = await openWallet(app, 'euro@example.com', 'EUR');
    await request(app.getHttpServer())
      .post('/api/top-ups')
      .set('Idempotency-Key', 'fund-short-0001')
      .send({ walletId: from.id, amount: 800 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/transfers')
      .set('Idempotency-Key', 'transfer-short-0001')
      .send({ fromWalletId: from.id, toWalletId: to.id, amount: 801 })
      .expect(422);

    await request(app.getHttpServer())
      .post('/api/transfers')
      .set('Idempotency-Key', 'transfer-self-00001')
      .send({ fromWalletId: from.id, toWalletId: from.id, amount: 100 })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/transfers')
      .set('Idempotency-Key', 'transfer-fx-000001')
      .send({ fromWalletId: from.id, toWalletId: eur.id, amount: 100 })
      .expect(400);

    const exact = await request(app.getHttpServer())
      .post('/api/transfers')
      .set('Idempotency-Key', 'transfer-exact-0001')
      .send({ fromWalletId: from.id, toWalletId: to.id, amount: 800 })
      .expect(201);
    expect((exact.body as MovementBody).amount).toBe(800);

    const sender = await request(app.getHttpServer()).get(`/api/wallets/${from.id}`).expect(200);
    const receiver = await request(app.getHttpServer()).get(`/api/wallets/${to.id}`).expect(200);
    expect((sender.body as WalletBody).balance).toBe(0);
    expect((receiver.body as WalletBody).balance).toBe(800);
  });

  it('paginates history newest first and records an audit row', async () => {
    const from = await openWallet(app, 'history@example.com');
    const to = await openWallet(app, 'history-to@example.com');
    await request(app.getHttpServer())
      .post('/api/top-ups')
      .set('Idempotency-Key', 'hist-fund-00001')
      .send({ walletId: from.id, amount: 1000, memo: 'float' })
      .expect(201);

    const journalIds: string[] = [];
    for (let index = 1; index <= 5; index += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/transfers')
        .set('Idempotency-Key', `hist-move-${index}-000`)
        .send({ fromWalletId: from.id, toWalletId: to.id, amount: 100, memo: `item ${index}` })
        .expect(201);
      journalIds.push((response.body as MovementBody).journalId);
    }

    const page1 = await request(app.getHttpServer())
      .get(`/api/wallets/${from.id}/history`)
      .query({ page: 1, pageSize: 4 })
      .expect(200);
    const page2 = await request(app.getHttpServer())
      .get(`/api/wallets/${from.id}/history`)
      .query({ page: 2, pageSize: 4 })
      .expect(200);

    const first = page1.body as HistoryBody;
    const second = page2.body as HistoryBody;
    expect(first.total).toBe(6);
    expect(first.items).toHaveLength(4);
    expect(second.items).toHaveLength(2);
    expect(first.items[0].journalId).toBe(journalIds[journalIds.length - 1]);
    expect(first.items[0].direction).toBe('out');
    expect(second.items.map((item) => item.journalId)).toContain(journalIds[0]);

    const incoming = await request(app.getHttpServer())
      .get(`/api/wallets/${to.id}/history`)
      .query({ pageSize: 10 })
      .expect(200);
    expect((incoming.body as HistoryBody).items.every((item) => item.direction === 'in')).toBe(true);

    const audit = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .query({ pageSize: 100 })
      .expect(200);
    const rows = (audit.body as { items: Array<{ path: string; method: string; idempotencyKey: string | null; statusCode: number }> }).items;
    const transferLog = rows.find((row) => row.path === '/api/transfers' && row.idempotencyKey === 'hist-move-5-000');
    expect(transferLog).toMatchObject({ method: 'POST', statusCode: 201 });
  });

  it('rejects an unbalanced journal when the database commits', async () => {
    const wallet = await openWallet(app, 'trigger@example.com');
    const dataSource = app.get(DataSource);
    await expect(
      dataSource.transaction(async (manager) => {
        const account = await manager.findOneByOrFail(Account, { id: wallet.id });
        const journal = await manager.save(
          manager.create(Journal, { journalType: 'transfer', memo: 'one sided' }),
        );
        await manager.save(
          manager.create(LedgerEntry, {
            journal,
            account,
            side: 'debit',
            amount: 100,
            currency: 'USD',
          }),
        );
      }),
    ).rejects.toThrow(/unbalanced journal/);
  });
});

describe('sensitive route throttling', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.THROTTLE_SENSITIVE_LIMIT = '3';
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 once the sensitive route limit is passed', async () => {
    const wallet = await openWallet(app, 'throttle@example.com');
    for (let index = 0; index < 3; index += 1) {
      await request(app.getHttpServer())
        .post('/api/top-ups')
        .set('Idempotency-Key', `throttle-ok-${index}-key`)
        .send({ walletId: wallet.id, amount: 100 })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/api/top-ups')
      .set('Idempotency-Key', 'throttle-blocked-key')
      .send({ walletId: wallet.id, amount: 100 })
      .expect(429);
  });
});
