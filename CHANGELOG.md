# 更新记录

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [未发布]

## [0.1.0] - 2026-11-01

### 新增

- 对话：流式输出、思考过程、多步工具调用、停止；刷新页面接上进行中的回合。
- 回合记录完整落库，历史按预算整回合截断。
- 设置页：模型连接（任意 OpenAI 兼容接口）、思考模式与强度、工具开关、附加系统提示。
- 工具：`current_time`、`save_note`、`search_notes`；`fetch_url` 已注册但默认不开放。
- 笔记页。
- `scripts/dev.mjs` 一键启动；`scripts/e2e.mjs` 端到端冒烟；GitHub Actions CI。
