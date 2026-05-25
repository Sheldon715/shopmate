import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "./pool";

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
}

export interface MigrationResult {
  applied: AppliedMigration[];
  skipped: string[];
}

interface MigrationFile {
  version: string;
  name: string;
  checksum: string;
  sql: string;
}

function getMigrationDirectory(): string {
  const candidates = [
    path.resolve(process.cwd(), "src", "lib", "db", "migrations"),
    path.resolve(__dirname, "migrations"),
    path.resolve(process.cwd(), "dist", "lib", "db", "migrations"),
  ];

  const directory = candidates.find((candidate) => existsSync(candidate));

  if (!directory) {
    throw new Error("Cannot find database migrations directory.");
  }

  return directory;
}

function checksumSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

async function readMigrationFiles(): Promise<MigrationFile[]> {
  const directory = getMigrationDirectory();
  const fileNames = (await readdir(directory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  const migrations: MigrationFile[] = [];

  for (const fileName of fileNames) {
    const sql = await readFile(path.join(directory, fileName), "utf8");
    migrations.push({
      version: path.basename(fileName, ".sql"),
      name: fileName,
      checksum: checksumSql(sql),
      sql,
    });
  }

  return migrations;
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isMigrationApplied(
  client: PoolClient,
  migration: MigrationFile,
): Promise<boolean> {
  const result = await client.query<{ checksum: string }>(
    "SELECT checksum FROM schema_migrations WHERE version = $1",
    [migration.version],
  );

  if (result.rowCount === 0) {
    return false;
  }

  const appliedChecksum = result.rows[0]?.checksum;

  if (appliedChecksum !== migration.checksum) {
    throw new Error(
      `Migration ${migration.name} checksum changed after it was applied.`,
    );
  }

  return true;
}

export async function runMigrations(pool: Pool): Promise<MigrationResult> {
  const migrations = await readMigrationFiles();
  const applied: AppliedMigration[] = [];
  const skipped: string[] = [];

  await withTransaction(pool, async (client) => {
    await ensureMigrationTable(client);

    for (const migration of migrations) {
      const alreadyApplied = await isMigrationApplied(client, migration);

      if (alreadyApplied) {
        skipped.push(migration.name);
        continue;
      }

      await client.query(migration.sql);
      await client.query(
        `
          INSERT INTO schema_migrations (version, name, checksum)
          VALUES ($1, $2, $3)
        `,
        [migration.version, migration.name, migration.checksum],
      );

      applied.push({
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
      });
    }
  });

  return { applied, skipped };
}
