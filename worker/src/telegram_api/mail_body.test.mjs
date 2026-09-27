import assert from "node:assert/strict";
import { test } from "node:test";
import { mailBody } from "./mail_body.ts";

test("keeps plain text unchanged and reads HTML-only mail", () => {
    assert.equal(mailBody("Code: 123456\nVisit https://example.com", "<p>ignored</p>"), "Code: 123456\nVisit https://example.com");
    assert.equal(mailBody("", "<p>验证码：123456</p><div>激活链接：</div><a href=\"https://example.com/?a=1&amp;b=2\">打开</a><script>ignored()</script>"), "验证码：123456\n\n激活链接：\n打开 https://example.com/?a=1&b=2");
});

test("replaces image links only and retains long activation links", () => {
    const activation = `https://example.com/activate?token=${"a".repeat(500)}`;
    assert.equal(mailBody(`[image: logo] <https://example.com/logo.png>\n${activation}\nhttps://example.com/photo.jpg`, ""), `[图片]\n${activation}\n[图片]`);
    assert.equal(mailBody("", `<img src="https://example.com/logo.png"><a href="${activation}">激活账号</a>`), `[图片]激活账号 ${activation}`);
});
