export function parsePositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

export function positiveEnvInteger(name: string, fallback: number): number {
  return parsePositiveInteger(process.env[name]) ?? fallback;
}
