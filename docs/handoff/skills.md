# 交接：Skill 系统

## 背景

Wren 现在只有工具。「怎么把一类事做好」的经验，目前只能写进系统提示，越写越长，而且每个对话都要带着。

产品同学已经在仓库的 `skills/` 下写了几个 skill，格式遵循 [Agent Skills 规范](https://agentskills.io/specification)。需要一套 skill 系统，让 agent 真正用上它们。

## 要做到

- agent 能发现并按需使用 skill。来源有两个：仓库内置的 `skills/`，和用户本地目录（不入库）。同名时以用户的为准。
- 当前对话用不到的 skill 不占上下文。
- 用户可以用 `/skill-name` 指定使用某个 skill。
- 一个 skill 用上之后，在后续对话里继续生效。
- skill 可以通过 `allowed-tools` 带上自己需要的工具。在本项目中，这些工具只在该 skill 生效时对模型开放。
- 设置页能看到所有 skill 及其状态，能启用、停用。有问题的 skill 要能看出问题出在哪里。
- skill 是外部内容，读取时不能越出它自己的目录。

## 本期不做

- 执行 skill 自带的脚本。
- 在线安装 skill。

## 交付

- 一个 PR，描述里写清楚设计取舍和没有做的部分。
- 有测试，CI 通过。
- 开发过程中按 [CONTRIBUTING](../../CONTRIBUTING.md) 小步提交。
