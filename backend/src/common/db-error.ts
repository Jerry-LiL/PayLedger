export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as { code?: string; driverError?: { code?: string } };
  return candidate.code === '23505' || candidate.driverError?.code === '23505';
}
