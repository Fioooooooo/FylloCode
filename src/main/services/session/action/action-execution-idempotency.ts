// In-process idempotency cache for durable side-effects keyed by actionId.
// This cache does NOT survive process restart; domains that need cross-restart
// idempotency (e.g. task creation) should also use their own durable identity.
const idempotencyRecords = new Map<string, unknown>();

export function getIdempotencyRecord<T>(actionId: string): T | undefined {
  return idempotencyRecords.get(actionId) as T | undefined;
}

export function setIdempotencyRecord<T>(actionId: string, result: T): void {
  idempotencyRecords.set(actionId, result);
}

export function clearIdempotencyRecord(actionId: string): void {
  idempotencyRecords.delete(actionId);
}
