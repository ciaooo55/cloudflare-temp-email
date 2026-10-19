# Skills

给 AI agent 用的 skill 集合。

## 有什么

- `email-simulation-test/` — 模拟收信全链路测试：往 D1/KV 里写模拟邮件，验证收信、解析、推送、快照整条链路
- `cf-temp-mail-agent-mail` — 临时邮箱 agent skill（上游带的），AI 可直接调用邮箱 API

## 在项目中的作用

改完代码后不用等真实邮件，用 skill 模拟来件快速验证功能是否正常。

## 怎么用

详见各 skill 目录下的 `SKILL.md`。
