import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createD1 } from '../test-loader/d1.mjs';
import { DEFAULT_ABUSE_SETTINGS } from './abuse_settings.ts';
import { USAGE_BUDGET_SCHEMA } from './usage_budget.ts';
import { WORKER_STORE_SCHEMA } from './worker_store.ts';

// Use the Worker's existing build tool to load its complete TypeScript entry point.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const hook = registerHooks({
resolve(specifier, context, next) {
    if (specifier === 'worker-mailer') return { shortCircuit: true,
        url: 'data:text/javascript,export class WorkerMailer { constructor(){throw new Error("SMTP is outside this snapshot test");}}' };
    return next(specifier, context);
}, load(url, context, next) {
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
        source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'ts', format: 'esm' }).code };
    return next(url, context);
} });
const { default: worker } = await import('./worker.ts');
hook.deregister();

test('snapshot requests across links share an IP ban before the ledger; quota denial does not write counters', async t => {
    const DB = createD1();
    t.after(() => DB.sqlite.close());
    DB.sqlite.exec(WORKER_STORE_SCHEMA + USAGE_BUDGET_SCHEMA);
    DB.sqlite.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    DB.sqlite.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('abuse_protection_settings',
        JSON.stringify({ ...DEFAULT_ABUSE_SETTINGS, snapshotLimit: 2 }));
    const env = { DB, JWT_SECRET: 'local-test-only', DOMAINS: ['example.com'] };
    const visit = (token, extra = {}) => worker.fetch(new Request('https://mail.example.com/m/' + token,
        { headers: { 'cf-connecting-ip': '203.0.113.1' }, ...extra }), env, { waitUntil() {} });
    assert.equal((await visit('invalid')).status, 404);
    assert.equal((await visit('a'.repeat(64))).status, 404);
    assert.equal((await visit('b'.repeat(64), { method: 'HEAD' })).status, 404);
    const denied = await visit('c'.repeat(64));
    assert.equal(denied.status, 429);
    assert.equal(denied.headers.get('Retry-After'), '600');
    assert.equal(denied.headers.get('Cache-Control'), 'no-store');
    const changes = DB.sqlite.prepare('SELECT total_changes() AS n').get().n;
    for (let i = 0; i < 20; i++) assert.equal((await visit('d'.repeat(64))).status, 429);
    assert.equal(DB.sqlite.prepare('SELECT total_changes() AS n').get().n, changes);

    // A fresh IP with no remaining budget must not create a writable counter.
    env.D1_DAILY_WRITE_SOFT_LIMIT = '0';
    // Separate DB identity models a new isolate with no pre-reserved read lease.
    const exhausted = { ...env, DB: { ...DB } };
    const result = await worker.fetch(new Request('https://mail.example.com/m/' + 'a'.repeat(64),
        { headers: { 'cf-connecting-ip': '203.0.113.2' } }), exhausted, { waitUntil() {} });
    assert.equal(result.status, 503);
    assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM worker_rate_limits WHERE key LIKE '%203.0.113.2'").get().n, 0);
});
