import { createDatabasePool } from "../lib/db/pool";
import { runMigrations } from "../lib/db/migrate";

async function main(): Promise<void> {
  const pool = createDatabasePool({ allowExitOnIdle: true });

  try {
    const result = await runMigrations(pool);
    console.log(
      `Migrations complete. Applied: ${result.applied.length}, skipped: ${result.skipped.length}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
