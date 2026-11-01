# 参与开发

## 开发环境

按 [README](README.md#快速开始) 装好依赖后，`node scripts/dev.mjs` 启动全部进程。
提交前在本地跑一遍和 CI 相同的检查：

```bash
cd backend && ruff check . && ruff format --check . && pytest
cd agent && npm test
cd web && npm run build
node scripts/e2e.mjs
```

## 分支与提交

- 从 `main` 拉功能分支，命名 `feat/<简述>`、`fix/<简述>`。不要直接向 `main` 推送。
- **小步提交**：每完成一个能运行的小改动就提交一次，不要攒到最后一次性提交。还没做完的部分也可以提交，在摘要前加 `wip:`。
- **不要改写已有提交**：不要 amend、squash、rebase、force push。发现写错了，追加一个修复提交。Review 时会逐个提交看开发过程。
- 提交信息格式见 [AGENTS.md](AGENTS.md#提交信息)。

## Pull Request

- 一个 PR 只做一件事。按 [PR 模板](.github/pull_request_template.md) 填写设计说明与验证方式。
- CI 必须通过。
- 改动 [CODEOWNERS](.github/CODEOWNERS) 中列出的核心文件时，在 PR 描述里说明为什么不能在扩展点里完成。
- 不要顺手格式化、重命名或重构与本次改动无关的代码。

## AI 辅助开发

- 编码 agent 需要遵守的约定写在 [AGENTS.md](AGENTS.md)。
- AI 写出的代码由提交者负责：提交前读懂每一处改动，能解释为什么这样写。

## 安全

- API key 只保存在 `data/wren.db`，由设置页写入。不要把 key 写进代码、配置文件、测试或提交信息。
- 发现安全问题请直接联系维护者，不要公开提 issue。
