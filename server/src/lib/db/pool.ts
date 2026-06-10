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
    console.warn("PostgreSQL idle client disconnected:", {
      name: error.name,
      message: error.message,
      code: getErrorCode(error),
    });
  });

  return pool;
}

function getErrorCode(error: Error): string | undefined {
  const candidate = error as Error & { code?: unknown };

  return typeof candidate.code === "string" ? candidate.code : undefined;
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
