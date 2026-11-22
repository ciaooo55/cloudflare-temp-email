import { reserveUsage } from './usage_budget.ts';

const BATCH_SIZE = 100;
const MAX_BATCHES = 3;

export type RawMailCleanupResult = { success: boolean; deleted: number; complete: boolean };

export async function cleanupStaleRawMails(env: Bindings, olderThanMinutes = 10): Promise<RawMailCleanupResult> {
    let deleted = 0;
    const minutes = Math.max(1, Math.floor(Number(olderThanMinutes) || 10));
    try {
        if (!env.DB) throw new Error('DB not available');
        for (let batch = 0; batch < MAX_BATCHES; batch++) {
            const candidates = await env.DB.prepare(`SELECT id FROM raw_mails INDEXED BY idx_raw_mails_created_at
                WHERE created_at < datetime('now', ?) ORDER BY created_at, id LIMIT ?`)
                .bind(`-${minutes} minutes`, BATCH_SIZE).all<{ id: number }>();
            const size = candidates.results.length;
            if (size === 0) return { success: true, deleted, complete: true };
            // Includes both indexed scans, the primary key and three secondary indexes.
            if (!await reserveUsage(env, 'soft', { reads: size * 3 + 2, writes: size * 4 })) {
                return { success: false, deleted, complete: false };
            }
            const result = await env.DB.prepare(`DELETE FROM raw_mails WHERE id IN (
                SELECT id FROM raw_mails INDEXED BY idx_raw_mails_created_at
                WHERE created_at < datetime('now', ?) ORDER BY created_at, id LIMIT ?
            )`).bind(`-${minutes} minutes`, size).run();
            if (!result.success) throw new Error('Raw mail deletion failed');
            const changes = result.meta.changes;
            deleted += changes;
            if (changes < BATCH_SIZE) return { success: true, deleted, complete: true };
        }
        return { success: true, deleted, complete: false };
    } catch (error) {
        console.error('[scheduled] cleanupStaleRawMails failed:', error);
        return { success: false, deleted, complete: false };
    }
}
