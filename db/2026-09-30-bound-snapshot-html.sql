-- 绑定快照 HTML 存 D1：绕开 KV 读取的 30 秒边缘缓存强制下限，
-- 新邮件到达后绑定快照链接能秒级看到新内容。
-- 只有"绑定快照"走这张表；一次性快照继续走 KV（不受影响）。
CREATE TABLE IF NOT EXISTS bound_snapshot_html (
    token TEXT PRIMARY KEY,
    html TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
