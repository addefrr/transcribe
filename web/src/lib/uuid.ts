const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Screen path params before querying: Postgres errors on malformed uuids. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
