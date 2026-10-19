# Skill 及测试

测试、调试用的工具和 skill 集合。不影响线上运行，纯辅助。

## 结构

- `skills/` — 给 AI agent 用的 skill（比如模拟收信全链路测试）
- `e2e/` — 端到端测试（Playwright + Docker，API/浏览器/SMTP 全链路）
- `scripts/` — 杂项脚本工具

## 在项目中的作用

保证改代码不翻车。改完 `app/` 后先跑测试，确认收信、推送、管理后台都没问题再部署。

## 怎么用

详见各子目录的 README。
