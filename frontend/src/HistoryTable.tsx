import { formatCents, formatWhen } from './format';
import type { HistoryItem } from './api';

interface HistoryTableProps {
  items: HistoryItem[];
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function HistoryTable({ items, page, pageSize, total, onPage }: HistoryTableProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="panel history">
      <header className="panel-head">
        <div>
          <h2>History</h2>
          <p>{total === 0 ? 'No lines yet' : `${total} ledger lines`}</p>
        </div>
        <div className="pager">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages}>
            Next
          </button>
        </div>
      </header>
      {items.length === 0 ? (
        <p className="empty">Top up this wallet or send a transfer to see activity here.</p>
      ) : (
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Counterparty</th>
              <th>Memo</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.journalId}>
                <td>{formatWhen(item.createdAt)}</td>
                <td>{item.type === 'top_up' ? 'Top-up' : 'Transfer'}</td>
                <td>{item.counterparty?.name ?? '—'}</td>
                <td>{item.memo ?? '—'}</td>
                <td className={item.direction === 'in' ? 'num in' : 'num out'}>
                  {item.direction === 'in' ? '+' : '−'}
                  {formatCents(item.amount, item.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
