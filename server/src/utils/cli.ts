export function readText(arg: string, prefix: string): string {
  const value = arg.slice(prefix.length).trim();

  if (value.length === 0) {
    throw new Error(`${prefix.slice(0, -1)} cannot be empty.`);
  }

  return value;
}

export function readNext(
  argv: string[],
  index: number,
  name: string,
  options: { missingMessage?: string; trim?: boolean } = {},
): string {
  const rawValue = argv[index + 1];
  const value = options.trim === false ? rawValue : rawValue?.trim();

  if (!value) {
    throw new Error(options.missingMessage ?? `${name} requires a value.`);
  }

  return value;
}

export function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
