import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  const raw = await readFile(filePath, "utf8");

  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

export async function writeJsonlFile<T>(
  filePath: string,
  items: T[],
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${items.map((item) => JSON.stringify(item)).join("\n")}\n`,
    "utf8",
  );
}
