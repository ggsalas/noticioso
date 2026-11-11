import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Async adapter over Node's built-in SQLite engine for Jest integration tests.
 * Unlike the removed SQL fake, this executes real SQLite syntax, constraints,
 * indexes, PRAGMAs, and transactions.
 * Requires Node 22.5 or newer (`node:sqlite`).
 */
export class RealSqliteTestDatabase {
  private readonly database = new DatabaseSync(":memory:");
  private transactionOpen = false;

  async execAsync(source: string): Promise<void> {
    this.database.exec(source);
  }

  async runAsync(source: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowId: number }> {
    const result = this.database.prepare(source).run(...(params as never[]));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(source: string, params: unknown[] = []): Promise<T | null> {
    return (this.database.prepare(source).get(...(params as never[])) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, params: unknown[] = []): Promise<T[]> {
    return this.database.prepare(source).all(...(params as never[])) as T[];
  }

  async withTransactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    if (this.transactionOpen) {
      return callback();
    }

    this.database.exec("BEGIN");
    this.transactionOpen = true;
    try {
      const result = await callback();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionOpen = false;
    }
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }

  asExpoDatabase(): SQLiteDatabase {
    return this as unknown as SQLiteDatabase;
  }
}
