# AGENTS.md

给在本仓库工作的编码 agent 的约定。人类贡献者请同时阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 项目结构

- `backend/`：Flask，Python 3.11+。唯一的持久化层（SQLite，`data/wren.db`）。
- `agent/`：Node.js 22+，ESM + JSDoc，无第三方依赖。不保存跨回合状态。
- `web/`：Vue 3（`<script setup>`，JavaScript）+ Vite。
- 三层之间的协议、扩展点和既有设定见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。动手前先读。

## 代码风格

- Python：ruff（配置在 `backend/pyproject.toml`），行宽 100，类型注解尽量写全。
- JavaScript：2 空格缩进、单引号、分号；公共函数写 JSDoc 类型。不要引入 TypeScript。
- 注释和面向用户的文案使用中文；标识符使用英文。
- 新增数据库表或字段：在 `backend/wren/migrations/` 加一个新的编号文件，不要修改已有迁移。
- 不要给 `agent/` 增加 npm 依赖；确实需要时先在 PR 里说明。

## 测试

- 后端：`cd backend && pytest`。新接口要有测试，用 `tests/conftest.py` 里的 `client` 与 `agent` 替身。
- agent：`cd agent && npm test`。涉及模型调用的测试使用 `test/support/fake-llm.js`，不要在测试里访问真实模型。
- 端到端：`node scripts/e2e.mjs`。
- 修改后运行相关测试并确认通过，再报告完成。

## 提交信息

- 格式：`<type>(<scope>): <摘要>`。type 取 `feat` / `fix` / `refactor` / `test` / `docs` / `chore` / `ci`；scope 取 `backend` / `agent` / `web` 或功能名。摘要用中文，不超过 50 字。
- 正文写动机和取舍，不罗列改了哪些文件。
- 由编码 agent 撰写的提交信息和 PR 描述，末尾加一行 `Assisted-by: <工具名>:<模型 ID>`，模型 ID 取运行环境提供的值。
