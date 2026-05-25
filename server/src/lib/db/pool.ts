import { Pool, type PoolClient } from "pg";
import { requireDatabaseUrl } from "../env";

export interface DatabasePoolOptions {
  allowExitOnIdle?: boolean;
}

let sharedPool: Pool | undefined;

export function createDatabasePool(options: DatabasePoolOptions = {}): Pool {
  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: options.allowExitOnIdle ?? false,
  });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL idle client error:", error);
  });

  return pool;
}

export function getDatabasePool(): Pool {
  if (!sharedPool) {
    sharedPool = createDatabasePool();
  }

  return sharedPool;
}

export async function closeDatabasePool(): Promise<void> {
  if (!sharedPool) {
    return;
  }

  await sharedPool.end();
  sharedPool = undefined;
}

export async function withTransaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
