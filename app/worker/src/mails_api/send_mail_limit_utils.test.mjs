import assert from "node:assert/strict";
import { test } from "node:test";
import { createD1 } from "../../test-loader/d1.mjs";
import { CONSTANTS } from "../constants.ts";
import { ensureSendMailLimit, increaseSendMailLimitCount } from "./send_mail_limit_utils.ts";

function setup() {
    const DB = createD1();
    DB.sqlite.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME);");
    const prepare = DB.prepare;
    const reads = [];
    DB.prepare = sql => {
        const statement = prepare(sql);
        if (/^SELECT value FROM settings/i.test(sql)) {
            const bind = statement.bind;
            statement.bind = key => {
                reads.push(key);
                return bind(key);
            };
        }
        return statement;
    };
    return { c: { env: { DB }, get() {} }, DB, reads };
}

test("successful sends reuse one limit-config read and still count enforced limits", async () => {
    const { c, DB, reads } = setup();
    const configKey = CONSTANTS.SEND_MAIL_LIMIT_CONFIG_KEY;
    const disabled = await ensureSendMailLimit(c);
    await increaseSendMailLimitCount(c, disabled);
    assert.deepEqual(reads, [configKey]);
    assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM settings").get().n, 0);

    DB.sqlite.prepare("INSERT INTO settings VALUES (?, ?, NULL)")
        .run(configKey, JSON.stringify({ dailyEnabled: true, monthlyEnabled: true, dailyLimit: 1, monthlyLimit: 10 }));
    reads.length = 0;
    const checked = await ensureSendMailLimit(c);
    await increaseSendMailLimitCount(c, checked);
    assert.equal(reads.filter(key => key === configKey).length, 1);
    assert.deepEqual(DB.sqlite.prepare("SELECT value FROM settings WHERE key <> ?").all(configKey).map(row => row.value), ["1", "1"]);
    await assert.rejects(ensureSendMailLimit(c));
});
