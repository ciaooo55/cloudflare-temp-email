import assert from "node:assert/strict";
import { test } from "node:test";
import { mailMessageParts } from "./mail_message.ts";

test("retains every character and a long clickable link across messages", () => {
    const link = `https://example.com/invite?token=${"a".repeat(2400)}`;
    const text = `📩 新邮件\n${"&<>".repeat(1300)}\n${link}\n末尾`;
    const parts = mailMessageParts(text);
    assert.equal(parts.map(part => part.text).join(""), text);
    assert.ok(parts.every(part => part.text.length <= 3900));
    const linked = parts.find(part => part.text.includes(link));
    assert.ok(linked);
    assert.deepEqual(linked.entities.find(entity => entity.type === "url"), {
        type: "url", offset: linked.text.indexOf(link), length: link.length
    });
});

test("marks verification codes for tap-to-copy with UTF-16 offsets", () => {
    const text = "📩 验证码：123456\nVerification code: A1B2C3\n認証コード：987654";
    const part = mailMessageParts(text)[0];
    const codes = part.entities.filter(entity => entity.type === "pre")
        .map(entity => part.text.slice(entity.offset, entity.offset + entity.length));
    assert.deepEqual(codes, ["123456", "A1B2C3", "987654"]);
});
