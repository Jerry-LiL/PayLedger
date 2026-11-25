import { DataSource } from 'typeorm';

/**
 * Synchronize creates tables but not triggers. This backstop runs at commit,
 * after every line of a journal is visible, and rejects a commit whose
 * debits and credits disagree.
 */
export async function ensureLedgerSchema(dataSource: DataSource): Promise<void> {
  await dataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  await dataSource.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await dataSource.query(`
    CREATE OR REPLACE FUNCTION enforce_balanced_journal() RETURNS trigger AS $$
    DECLARE
      jid uuid;
      debit_total bigint;
      credit_total bigint;
    BEGIN
      jid := COALESCE(NEW.journal_id, OLD.journal_id);
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE side = 'debit'), 0),
        COALESCE(SUM(amount) FILTER (WHERE side = 'credit'), 0)
      INTO debit_total, credit_total
      FROM ledger_entries
      WHERE journal_id = jid;

      IF debit_total <> credit_total THEN
        RAISE EXCEPTION 'unbalanced journal %', jid;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await dataSource.query(`DROP TRIGGER IF EXISTS ledger_entries_balanced ON ledger_entries`);
  await dataSource.query(`
    CREATE CONSTRAINT TRIGGER ledger_entries_balanced
    AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE PROCEDURE enforce_balanced_journal();
  `);

  await dataSource.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_external_per_currency
    ON accounts (currency)
    WHERE kind = 'external';
  `);

  await dataSource.query(`
    CREATE INDEX IF NOT EXISTS ledger_entries_account_created
    ON ledger_entries (account_id, created_at DESC);
  `);
}
