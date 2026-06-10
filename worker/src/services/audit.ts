import { generateId } from '../utils/id.js';

export async function writeAuditEvent(
  db: D1Database,
  userId: string | null,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const id = generateId();
  await db
    .prepare('INSERT INTO audit_events (id, user_id, event_type, payload) VALUES (?, ?, ?, ?)')
    .bind(id, userId, eventType, JSON.stringify(payload))
    .run();
  return id;
}
