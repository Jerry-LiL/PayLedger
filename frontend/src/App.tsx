import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  createWallet,
  listWallets,
  topUp,
  transfer,
  trialBalance,
  walletHistory,
  type HistoryPage,
  type TrialRow,
  type Wallet,
} from './api';
import { HistoryTable } from './HistoryTable';
import { dollarsToCents, formatCents, newIdempotencyKey } from './format';

const PAGE_SIZE = 5;

export function App() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [page, setPage] = useState(1);
  const [books, setBooks] = useState<TrialRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const historyRequest = useRef(0);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpMemo, setTopUpMemo] = useState('');
  const [topUpKey, setTopUpKey] = useState(newIdempotencyKey);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMemo, setTransferMemo] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferKey, setTransferKey] = useState(newIdempotencyKey);

  const selected = wallets.find((wallet) => wallet.id === selectedId) ?? null;

  const refreshWallets = useCallback(async (preferId?: string) => {
    const { data } = await listWallets();
    setWallets(data);
    setSelectedId((current) => {
      if (preferId && data.some((wallet) => wallet.id === preferId)) return preferId;
      if (current && data.some((wallet) => wallet.id === current)) return current;
      return data[0]?.id ?? null;
    });
    const trial = await trialBalance();
    setBooks(trial.data);
  }, []);

  const loadHistory = useCallback(async (walletId: string, nextPage: number) => {
    const requestId = ++historyRequest.current;
    const { data } = await walletHistory(walletId, nextPage, PAGE_SIZE);
    if (requestId !== historyRequest.current) return;
    setHistory(data);
  }, []);

  useEffect(() => {
    refreshWallets().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load wallets');
    });
  }, [refreshWallets]);

  useEffect(() => {
    if (!selectedId) {
      setHistory(null);
      return;
    }
    loadHistory(selectedId, page).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load history');
    });
  }, [selectedId, page, loadHistory]);

  useEffect(() => {
    if (!selected) return;
    if (!transferTo || transferTo === selected.id || !wallets.some((wallet) => wallet.id === transferTo)) {
      const other = wallets.find((wallet) => wallet.id !== selected.id && wallet.currency === selected.currency);
      setTransferTo(other?.id ?? '');
    }
  }, [selected, transferTo, wallets]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { data } = await createWallet({ name, email, currency: currency.toUpperCase() });
      setName('');
      setEmail('');
      setPage(1);
      await refreshWallets(data.id);
      setNotice(`Opened ${data.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the wallet');
    } finally {
      setBusy(false);
    }
  }

  async function onTopUp(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const amount = dollarsToCents(topUpAmount);
    if (amount == null) {
      setError('Enter a top-up amount like 25.00');
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await topUp(
        { walletId: selected.id, amount, memo: topUpMemo || undefined },
        topUpKey,
      );
      setTopUpAmount('');
      setTopUpMemo('');
      setPage(1);
      await refreshWallets(selected.id);
      await loadHistory(selected.id, 1);
      setNotice(
        result.replayed
          ? 'Replayed the previous top-up. No new ledger lines were written.'
          : `Added ${formatCents(amount, selected.currency)}.`,
      );
      if (!result.replayed) setTopUpKey(newIdempotencyKey());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Top-up failed');
    } finally {
      setBusy(false);
    }
  }

  async function onTransfer(event: FormEvent) {
    event.preventDefault();
    if (!selected || !transferTo) return;
    const amount = dollarsToCents(transferAmount);
    if (amount == null) {
      setError('Enter a transfer amount like 12.50');
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await transfer(
        {
          fromWalletId: selected.id,
          toWalletId: transferTo,
          amount,
          memo: transferMemo || undefined,
        },
        transferKey,
      );
      setTransferAmount('');
      setTransferMemo('');
      setPage(1);
      await refreshWallets(selected.id);
      await loadHistory(selected.id, 1);
      setNotice(
        result.replayed
          ? 'Replayed the previous transfer. No new ledger lines were written.'
          : `Sent ${formatCents(amount, selected.currency)}.`,
      );
      if (!result.replayed) setTransferKey(newIdempotencyKey());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  }

  function selectWallet(id: string) {
    setSelectedId(id);
    setPage(1);
    setError(null);
    setNotice(null);
  }

  const others = wallets.filter(
    (wallet) => wallet.id !== selected?.id && wallet.currency === selected?.currency,
  );

  return (
    <div className="page">
      <header className="mast">
        <div>
          <p className="mark">PayLedger</p>
          <h1>Wallet history</h1>
        </div>
        <p className="lede">
          Balances come from double-entry lines. A top-up credits the wallet and debits external
          funding. A transfer debits the sender and credits the receiver.
        </p>
      </header>

      {error ? <p className="banner error">{error}</p> : null}
      {notice ? <p className="banner ok">{notice}</p> : null}

      <div className="layout">
        <aside className="panel wallets">
          <h2>Wallets</h2>
          {wallets.length === 0 ? <p className="empty">No wallets yet.</p> : null}
          <ul>
            {wallets.map((wallet) => (
              <li key={wallet.id}>
                <button
                  type="button"
                  className={wallet.id === selectedId ? 'wallet active' : 'wallet'}
                  onClick={() => selectWallet(wallet.id)}
                >
                  <span>
                    <strong>{wallet.name}</strong>
                    <small>{wallet.email}</small>
                  </span>
                  <span className="balance">{formatCents(wallet.balance, wallet.currency)}</span>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={onCreate} className="stack">
            <h3>Open a wallet</h3>
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Currency
              <input
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                maxLength={3}
                pattern="[A-Za-z]{3}"
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              Create wallet
            </button>
          </form>
        </aside>

        <main>
          <section className="forms">
            <form onSubmit={onTopUp} className="panel stack">
              <h2>Top up</h2>
              <p className="hint">{selected ? selected.name : 'Select a wallet'}</p>
              <label>
                Amount
                <input
                  inputMode="decimal"
                  placeholder="25.00"
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                />
              </label>
              <label>
                Memo
                <input value={topUpMemo} onChange={(event) => setTopUpMemo(event.target.value)} maxLength={200} />
              </label>
              <label>
                Idempotency key
                <input value={topUpKey} onChange={(event) => setTopUpKey(event.target.value)} />
              </label>
              <div className="row">
                <button type="submit" disabled={busy || !selected}>
                  Add funds
                </button>
                <button type="button" className="ghost" onClick={() => setTopUpKey(newIdempotencyKey())}>
                  New key
                </button>
              </div>
            </form>

            <form onSubmit={onTransfer} className="panel stack">
              <h2>Transfer</h2>
              <p className="hint">From {selected ? selected.name : 'the selected wallet'}</p>
              <label>
                To
                <select value={transferTo} onChange={(event) => setTransferTo(event.target.value)}>
                  <option value="">Select a wallet</option>
                  {others.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} ({wallet.currency})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <input
                  inputMode="decimal"
                  placeholder="12.50"
                  value={transferAmount}
                  onChange={(event) => setTransferAmount(event.target.value)}
                />
              </label>
              <label>
                Memo
                <input
                  value={transferMemo}
                  onChange={(event) => setTransferMemo(event.target.value)}
                  maxLength={200}
                />
              </label>
              <label>
                Idempotency key
                <input value={transferKey} onChange={(event) => setTransferKey(event.target.value)} />
              </label>
              <div className="row">
                <button type="submit" disabled={busy || !selected || !transferTo}>
                  Send
                </button>
                <button type="button" className="ghost" onClick={() => setTransferKey(newIdempotencyKey())}>
                  New key
                </button>
              </div>
            </form>
          </section>

          <HistoryTable
            items={history?.items ?? []}
            page={history?.page ?? page}
            pageSize={PAGE_SIZE}
            total={history?.total ?? 0}
            onPage={setPage}
          />

          <footer className="books">
            {books.length === 0 ? (
              <span>Books are empty.</span>
            ) : (
              books.map((row) => (
                <span key={row.currency}>
                  {row.currency} debits {formatCents(row.debits, row.currency)} = credits{' '}
                  {formatCents(row.credits, row.currency)}
                </span>
              ))
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}
