-- 绑定元数据走 D1：KV 有 30 秒边缘缓存，建完绑定立即发邮件可能读到 null 导致快照没写。
-- D1 无边缘缓存，refreshBoundSnapshot 优先读 D1，保证新邮件一定能找到绑定。
CREATE TABLE IF NOT EXISTS snapshot_bindings (
    address TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    url TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshot_bindings_token ON snapshot_bindings(token);
