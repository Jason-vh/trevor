import { Database, type Statement } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import {
  type SqliteDatabase,
  type SqliteExecutor,
  SqliteStorage,
  type SqliteValue,
} from "@earendil-works/pi-durable/storage/sqlite";

// pi-durable ships a SQLite adapter for `node:sqlite` only, which Bun does not provide.
// This is the same adapter on top of `bun:sqlite`.

const BUSY_TIMEOUT_MS = 5_000;

type TransactionScope = { active: boolean };

/**
 * Runs operations one at a time, in call order. While a transaction runs, every other
 * operation waits for it, as the `SqliteDatabase` contract requires.
 */
class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }
}

abstract class BunSqliteExecutor implements SqliteExecutor {
  constructor(
    protected readonly database: Database,
    private readonly statements: Map<string, Statement>,
  ) {}

  exec(sql: string): Promise<void> {
    return this.runOperation(() => {
      this.database.run(sql);
    });
  }

  run(sql: string, ...params: SqliteValue[]): Promise<void> {
    return this.runOperation(() => {
      this.statement(sql).run(...params);
    });
  }

  get<T extends object>(sql: string, ...params: SqliteValue[]): Promise<T | undefined> {
    return this.runOperation(() => (this.statement(sql).get(...params) as T | null) ?? undefined);
  }

  all<T extends object>(sql: string, ...params: SqliteValue[]): Promise<T[]> {
    return this.runOperation(() => this.statement(sql).all(...params) as T[]);
  }

  protected abstract runOperation<T>(operation: () => T): Promise<T>;

  private statement(sql: string): Statement {
    let statement = this.statements.get(sql);
    if (statement === undefined) {
      statement = this.database.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }
}

class BunSqliteTransaction extends BunSqliteExecutor {
  constructor(
    database: Database,
    statements: Map<string, Statement>,
    private readonly scope: TransactionScope,
  ) {
    super(database, statements);
  }

  protected async runOperation<T>(operation: () => T): Promise<T> {
    if (!this.scope.active) throw new Error("SQLite transaction handle is no longer active");
    return operation();
  }
}

class BunSqliteDatabase extends BunSqliteExecutor implements SqliteDatabase {
  private readonly queue = new SerialQueue();
  private readonly sharedStatements: Map<string, Statement>;
  private closed = false;

  constructor(database: Database) {
    const statements = new Map<string, Statement>();
    super(database, statements);
    this.sharedStatements = statements;
  }

  transaction<T>(callback: (transaction: SqliteExecutor) => Promise<T>): Promise<T> {
    return this.queue.run(async () => {
      this.database.run("BEGIN IMMEDIATE");
      const scope = { active: true };
      try {
        const result = await callback(new BunSqliteTransaction(this.database, this.sharedStatements, scope));
        scope.active = false;
        this.database.run("COMMIT");
        return result;
      } catch (error) {
        scope.active = false;
        try {
          this.database.run("ROLLBACK");
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], "SQLite transaction failed and rollback failed");
        }
        throw error;
      }
    });
  }

  close(): Promise<void> {
    return this.queue.run(() => {
      if (this.closed) return;
      this.closed = true;
      for (const statement of this.sharedStatements.values()) statement.finalize();
      this.sharedStatements.clear();
      try {
        this.database.run("PRAGMA wal_checkpoint(TRUNCATE)");
      } finally {
        this.database.close();
      }
    });
  }

  protected runOperation<T>(operation: () => T): Promise<T> {
    return this.queue.run(operation);
  }
}

export function openBunSqliteDatabase(path: string): SqliteDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const database = new Database(path, { create: true });
  database.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  database.run("PRAGMA journal_mode = WAL");
  database.run("PRAGMA synchronous = NORMAL");

  return new BunSqliteDatabase(database);
}

/** Opens (or creates) durable conversation storage in a SQLite file. */
export function openConversationStorage(path: string): Promise<SqliteStorage> {
  return SqliteStorage.open(openBunSqliteDatabase(path));
}
