import { CONSTANTS } from './constants.ts';

export const WORKER_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS worker_store (
    key TEXT PRIMARY KEY, value TEXT, expires_at INTEGER, chunks INTEGER NOT NULL DEFAULT 0, revision TEXT
);
CREATE INDEX IF NOT EXISTS idx_worker_store_expires ON worker_store(expires_at);
CREATE TABLE IF NOT EXISTS worker_store_chunk (
    key TEXT NOT NULL REFERENCES worker_store(key) ON DELETE CASCADE,
    part INTEGER NOT NULL, value BLOB NOT NULL, PRIMARY KEY (key, part)
);
CREATE TABLE IF NOT EXISTS worker_store_import (
    id INTEGER PRIMARY KEY CHECK (id = 1), cursor TEXT, complete INTEGER NOT NULL
);
`;

export const WORKER_STORE_TRIGGER = `CREATE TRIGGER IF NOT EXISTS clear_worker_store_chunks
AFTER UPDATE OF value, chunks, revision ON worker_store WHEN OLD.chunks > 0 BEGIN
    DELETE FROM worker_store_chunk WHERE key = OLD.key;
END`;

const SETTINGS_KEYS = new Set<string>([
    CONSTANTS.EMAIL_KV_BLACK_LIST, CONSTANTS.TG_KV_SETTINGS_KEY,
    CONSTANTS.WEBHOOK_KV_SETTINGS_KEY, CONSTANTS.WEBHOOK_KV_ADMIN_MAIL_SETTINGS_KEY,
]);
const LEGACY_KEYS = new Set([...SETTINGS_KEYS, "telegram:webhook-secret:default"]);
const LEGACY_RUN_KEYS = new Set(["scheduled:last_run:raw_mails", "scheduled:last_run:auto_cleanup"]);
const LEGACY_PREFIXES = [
    `${CONSTANTS.TG_KV_PREFIX}:`, `${CONSTANTS.WEBHOOK_KV_USER_SETTINGS_KEY}:`,
    "snapshot-bind:", "snapshot-bindrev:", "mailhtml:",
];
const CHUNK_BYTES = 750_000;
const IMPORT_LIMIT = 5;
const CACHE_TTL = 5000;
type Row = { key: string | null; value: string | null; expires_at: number | null; chunks: number; revision: string | null; complete?: number };
type Options = { expiration?: number; expirationTtl?: number };
type ReadOptions = "json" | { type?: "json"; promoteLegacy?: boolean };
type Cached = { value: string | null; until: number };
const caches = new WeakMap<D1Database, Map<string, Cached>>();
const legacyHtmlTables = new WeakMap<D1Database, boolean>();

async function legacySnapshotHtml(db: D1Database, key: string) {
    if (!key.startsWith("mailhtml:")) return null;
    let exists = legacyHtmlTables.get(db);
    if (exists === undefined) {
        exists = !!(await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bound_snapshot_html'").first());
        legacyHtmlTables.set(db, exists);
    }
    return exists ? db.prepare("SELECT html FROM bound_snapshot_html WHERE token = ?")
        .bind(key.slice("mailhtml:".length)).first<string>("html") : null;
}

function settingsCache(db: D1Database) {
    let cache = caches.get(db);
    if (!cache) {
        cache = new Map();
        caches.set(db, cache);
    }
    return cache;
}

async function write(db: D1Database, key: string, value: string | null, expiresAt: number | null, importOnly = false) {
    const chunks = value && value.length > 100_000 ? new TextEncoder().encode(value) : null;
    const numChunks = chunks ? Math.ceil(chunks.byteLength / CHUNK_BYTES) : 0;
    const revision = chunks ? crypto.randomUUID() : null;
    const upsert = db.prepare(`INSERT INTO worker_store (key, value, expires_at, chunks, revision) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (key) ${importOnly ? "DO NOTHING" : `DO UPDATE SET
            value = excluded.value, expires_at = excluded.expires_at, chunks = excluded.chunks, revision = excluded.revision
            WHERE value IS NOT excluded.value OR expires_at IS NOT excluded.expires_at OR chunks != 0`}`
    ).bind(key, chunks ? "" : value, expiresAt, numChunks, revision);
    if (!chunks) {
        await upsert.run();
    } else {
        const statements = [upsert];
        for (let part = 0; part < numChunks; part++) {
            const buffer = chunks.slice(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES).buffer;
            statements.push(db.prepare(`INSERT INTO worker_store_chunk (key, part, value)
                SELECT key, ?, ? FROM worker_store WHERE key = ? AND revision = ?`).bind(part, buffer, key, revision));
        }
        await db.batch(statements);
    }
    settingsCache(db).delete(key);
}

async function lookup(env: Bindings, key: string, promoteLegacy: boolean, retries = 1): Promise<string | null> {
    const db = env.DB;
    const now = Date.now();
    const cache = SETTINGS_KEYS.has(key) ? settingsCache(db) : undefined;
    const hit = cache?.get(key);
    if (hit && now < hit.until) return hit.value;
    const row = env.KV
        ? await db.prepare(`SELECT s.*, (SELECT complete FROM worker_store_import WHERE id = 1) AS complete
            FROM (SELECT 1) LEFT JOIN worker_store s ON s.key = ?`).bind(key).first<Row>()
        : await db.prepare("SELECT * FROM worker_store WHERE key = ?").bind(key).first<Row>();
    let value: string | null = null;
    if (row?.key && (row.expires_at === null || row.expires_at > now)) {
        if (row.chunks) {
            const { results } = await db.prepare(`SELECT c.value FROM worker_store_chunk c JOIN worker_store s USING (key)
                WHERE c.key = ? AND s.revision = ? ORDER BY c.part`).bind(key, row.revision).all<{ value: number[] }>();
            if (results.length !== row.chunks) {
                if (retries) return lookup(env, key, promoteLegacy, retries - 1);
                throw new Error("Stored value changed while reading");
            }
            const decoder = new TextDecoder();
            value = results.map(chunk => decoder.decode(new Uint8Array(chunk.value), { stream: true })).join("") + decoder.decode();
        } else {
            value = row.value;
        }
    } else if (!row?.key && env.KV && !row?.complete) {
        value = await env.KV.get(key, key.startsWith("snapshot-bind") || key.startsWith("mailhtml:") ? { cacheTtl: 30 } : undefined);
        if (value !== null) value = await legacySnapshotHtml(db, key) ?? value;
        if (value !== null && promoteLegacy && LEGACY_KEYS.has(key)) await write(db, key, value, null, true);
    }
    cache?.set(key, { value, until: now + CACHE_TTL });
    return value;
}

export function workerStore(env: Bindings) {
    return {
        async get<T = string>(key: string, options?: ReadOptions): Promise<T | null> {
            const value = await lookup(env, key, typeof options !== "object" || options.promoteLegacy !== false);
            if (value === null) return null;
            return (options === "json" || options?.type === "json" ? JSON.parse(value) : value) as T;
        },
        async put(key: string, value: string, options?: Options) {
            const expiry = options?.expiration ?? (options?.expirationTtl ? Math.floor(Date.now() / 1000) + options.expirationTtl : null);
            await write(env.DB, key, value, expiry === null ? null : expiry * 1000);
        },
        async delete(key: string) {
            await write(env.DB, key, null, null);
        },
        async setExpiry(key: string, expiration: number | null) {
            const updated = await env.DB.prepare("UPDATE worker_store SET expires_at = ? WHERE key = ? AND value IS NOT NULL")
                .bind(expiration, key).run();
            if (updated.meta.changes || !env.KV) return;
            const legacy = await lookup(env, key, false);
            if (legacy !== null) await write(env.DB, key, legacy, expiration, true);
        },
        async list({ prefix }: { prefix: string }) {
            const end = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
            const rows = await env.DB.prepare(`SELECT key AS name, CASE WHEN chunks = 0 THEN value END AS value
                FROM worker_store WHERE key >= ? AND key < ? AND value IS NOT NULL AND (expires_at IS NULL OR expires_at > ?)`)
                .bind(prefix, end, Date.now()).all<{ name: string; value: string | null }>();
            const entries = new Map(rows.results.map(({ name, value }) => [name, value]));
            if (env.KV && !(await getStoreImportStatus(env)).complete) {
                let cursor: string | undefined;
                do {
                    const page = await env.KV.list({ prefix, cursor });
                    for (const { name } of page.keys) if (!entries.has(name)) entries.set(name, null);
                    cursor = page.list_complete ? undefined : page.cursor;
                } while (cursor);
            }
            return { keys: [...entries].map(([name, value]) => ({ name, value })) };
        },
    };
}

export async function getStoreImportStatus(env: Bindings) {
    if (!env.KV) return { complete: true, cursor: null };
    const row = await env.DB.prepare("SELECT cursor, complete FROM worker_store_import WHERE id = 1")
        .first<{ cursor: string | null; complete: number }>();
    return { complete: !!row?.complete, cursor: row?.cursor ?? null };
}

export async function importStorePage(env: Bindings) {
    const state = await getStoreImportStatus(env);
    if (!env.KV || state.complete) return { complete: true, scanned: 0 };
    const page = await env.KV.list({ cursor: state.cursor ?? undefined, limit: IMPORT_LIMIT });
    for (const { name, expiration } of page.keys) {
        if (LEGACY_RUN_KEYS.has(name)) {
            const value = await env.KV.get(name);
            if (value !== null) await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(name, value).run();
            continue;
        }
        if (name === CONSTANTS.TELEGRAM_BOTS_KEY) {
            const value = await env.KV.get(name);
            if (value !== null) await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(name, value).run();
            continue;
        }
        if (!LEGACY_KEYS.has(name) && !LEGACY_PREFIXES.some(prefix => name.startsWith(prefix))) continue;
        if (await env.DB.prepare("SELECT 1 FROM worker_store WHERE key = ?").bind(name).first()) continue;
        const value = await legacySnapshotHtml(env.DB, name) ?? await env.KV.get(name);
        if (value !== null) {
            await write(env.DB, name, value, expiration === undefined ? null : expiration * 1000, true);
        } else if (expiration === undefined || expiration * 1000 > Date.now()) {
            throw new Error("Legacy KV value not yet readable; retry the import page");
        }
    }
    const result = await env.DB.prepare(`INSERT INTO worker_store_import (id, cursor, complete) VALUES (1, ?, ?)
        ON CONFLICT (id) DO UPDATE SET cursor = excluded.cursor, complete = excluded.complete
        WHERE worker_store_import.complete = 0 AND worker_store_import.cursor IS ?`
    ).bind(page.list_complete ? null : page.cursor, Number(page.list_complete), state.cursor).run();
    return { complete: result.meta.changes ? page.list_complete : (await getStoreImportStatus(env)).complete, scanned: page.keys.length };
}

export async function cleanupWorkerStore(env: Bindings) {
    const now = Date.now();
    if (env.KV && !(await getStoreImportStatus(env)).complete) return;
    await env.DB.prepare(`DELETE FROM worker_store WHERE key IN (
        SELECT key FROM worker_store WHERE expires_at <= ? ORDER BY expires_at LIMIT 100
    )`).bind(now).run();
}
