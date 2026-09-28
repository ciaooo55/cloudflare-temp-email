import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSnapshotHtml, buildCompactMailMessage, extractVerificationCode, extractVerificationCodeWithSubject, extractVerificationLink } from "./mail_snapshot.ts";

test("extracts multilingual verification codes", () => {
    assert.deepEqual(extractVerificationCode("验证码：123456"), { isVerification: true, code: "123456" });
    assert.deepEqual(extractVerificationCode("Verification code: A1B2C3"), { isVerification: true, code: "A1B2C3" });
    assert.deepEqual(extractVerificationCode("認証コード：987654"), { isVerification: true, code: "987654" });
    assert.deepEqual(extractVerificationCode("没有验证码内容"), { isVerification: true, code: null });
    assert.deepEqual(extractVerificationCode("验证码：1 2 3 4 5 6"), { isVerification: true, code: "123456" });
    assert.deepEqual(extractVerificationCode("验证码：１２３４５６"), { isVerification: true, code: "123456" });
    assert.deepEqual(extractVerificationCode("64250 是你的确认码"), { isVerification: true, code: "64250" });
});

test("finds a verification link when the code is not present", () => {
    const html = '<a href="https://example.com/activate?token=abc">立即激活</a><a href="https://example.com/unsubscribe">取消订阅</a>';
    assert.equal(extractVerificationLink(html, ""), "https://example.com/activate?token=abc");
    assert.deepEqual(extractVerificationCodeWithSubject("安全码", "请点击链接", html, ""), {
        isVerification: true, code: null, verifyLink: "https://example.com/activate?token=abc"
    });
});

test("sanitizes snapshot HTML without removing normal links", () => {
    const html = buildSnapshotHtml(
        '<script>alert(1)</script><a href="https://example.com/activate">激活</a><img src="https://example.com/logo.png" onerror="alert(1)">',
        "ignored",
        "主题"
    );
    assert.match(html, /https:\/\/example\.com\/activate/);
    assert.doesNotMatch(html, /<script|onerror|javascript:/i);
});

test("marks the compact code and snapshot URL as Telegram entities", () => {
    const result = buildCompactMailMessage({
        chinese: true, subject: "登录", address: "user@example.com", sender: "a@example.com",
        createdAt: "2026-09-28 12:00:00", codeInfo: { isVerification: true, code: "123456" },
        snapshotUrl: "https://example.com/m/abc"
    });
    assert.equal(result.text.slice(result.entities[0].offset, result.entities[0].offset + result.entities[0].length), "123456");
    assert.equal(result.text.slice(result.entities[1].offset, result.entities[1].offset + result.entities[1].length), "https://example.com/m/abc");
});
