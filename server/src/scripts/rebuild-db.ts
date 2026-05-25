import { runMigrations } from "../lib/db/migrate";
import { createDatabasePool } from "../lib/db/pool";
import { getEnv } from "../lib/env";
import { importProductsCommand } from "./import-products";
import { normalizeProductsCommand } from "./normalize-products";
import { validateProductsCommand } from "./validate-products";

async function runDatabaseMigrations(): Promise<void> {
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

export async function rebuildDbCommand(): Promise<void> {
  const env = getEnv();

  await normalizeProductsCommand();
  await validateProductsCommand();

  if (env.importDryRun) {
    console.log(
      "Skipping migrations because IMPORT_DRY_RUN=true. Set DATABASE_URL and IMPORT_DRY_RUN=false to rebuild PostgreSQL.",
    );
  } else {
    await runDatabaseMigrations();
  }

  await importProductsCommand();
}

if (require.main === module) {
  rebuildDbCommand().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
