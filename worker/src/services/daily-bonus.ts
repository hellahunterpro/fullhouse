import { credit } from './wallet.js';
import { writeAuditEvent } from './audit.js';

const DAILY_BONUS = 1_000;
const STREAK_MULTIPLIER = 100; // extra chips per day of streak

export interface DailyBonusResult {
  awarded: boolean;
  amount: number;
  streak: number;
  nextAvailable: string;
}

export interface DailyBonusStatus {
  available: boolean;
  streak: number;
}

/** Read-only claim status for today, without mutating anything. */
export async function getDailyBonusStatus(
  db: D1Database,
  userId: string,
): Promise<DailyBonusStatus> {
  const today = new Date().toISOString().slice(0, 10);
  const lastClaim = await db
    .prepare(
      `SELECT payload FROM audit_events
       WHERE user_id = ? AND event_type = 'daily_bonus'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{ payload: string }>();

  if (!lastClaim) return { available: true, streak: 0 };

  const p = JSON.parse(lastClaim.payload) as { date: string; streak: number };
  if (p.date === today) return { available: false, streak: p.streak };

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const continuing = p.date === yesterday.toISOString().slice(0, 10);
  return { available: true, streak: continuing ? p.streak : 0 };
}

export async function claimDailyBonus(
  db: D1Database,
  userId: string,
  walletId: string,
): Promise<DailyBonusResult> {
  const today = new Date().toISOString().slice(0, 10);

  // Check last claim
  const lastClaim = await db
    .prepare(
      `SELECT payload FROM audit_events
       WHERE user_id = ? AND event_type = 'daily_bonus'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{ payload: string }>();

  if (lastClaim) {
    const p = JSON.parse(lastClaim.payload);
    if (p.date === today) {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);
      return {
        awarded: false,
        amount: 0,
        streak: p.streak,
        nextAvailable: tomorrow.toISOString(),
      };
    }

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const streak = p.date === yesterdayStr ? p.streak + 1 : 1;
    const amount = DAILY_BONUS + streak * STREAK_MULTIPLIER;

    await credit(db, walletId, amount, 'daily_bonus', {
      refKey: `daily:${userId}:${today}`,
      description: `Daily bonus (streak ${streak})`,
    });

    await writeAuditEvent(db, userId, 'daily_bonus', {
      date: today,
      streak,
      amount,
    });

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    return { awarded: true, amount, streak, nextAvailable: tomorrow.toISOString() };
  }

  // First ever claim
  const amount = DAILY_BONUS + STREAK_MULTIPLIER;
  await credit(db, walletId, amount, 'daily_bonus', {
    refKey: `daily:${userId}:${today}`,
    description: 'Daily bonus (streak 1)',
  });

  await writeAuditEvent(db, userId, 'daily_bonus', {
    date: today,
    streak: 1,
    amount,
  });

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  return { awarded: true, amount, streak: 1, nextAvailable: tomorrow.toISOString() };
}
