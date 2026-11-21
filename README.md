# dsh-blueprint-tree

**把思维链变成一张能保存、能验证的蓝图。** A workflow plugin for [DeepSeek Harness](https://github.com/deepseek-ai/dsh) that turns a chain of thoughts into a persistent, typed graph.

中文说明见 [README.zh.md](./README.zh.md)。

---

## What it is

A blueprint is a graph of **units** (nodes) joined by **vectors** (edges), stored as plain JSON, drawn in the plugin panel, and executed by a built-in state machine.

Three layers:

| 层 | 内容 | 谁写 |
| --- | --- | --- |
| 插件层 | 状态机、共享数据、图算法、检查 | 插件（写死） |
| 蓝图·子蓝图层 | `flow.json` 与子蓝图 `*.json` | 人 / AI 用命令改 |
| 方法层 | `*.方法.ts` 里的 TS 正文 | AI 写，插件生成骨架与取数行 |

- 单元有类型（开始/结束/软/硬/选择/子蓝图）、标签（强制/广播/并发）和状态（正常/提醒/报错/废弃/失效/断联）。
- 方法签名统一 `(输入: 上游输入[])`，插件按上游自动生成带类型标注的「取数行」；上游契约一变，下游取数行自动重写并把状态标 `提醒`。
- 一张图既能由引擎跑（`run` / `test.*`），也能当「思维网」由 AI 自己当状态机走。

## Install

In DSH Desktop:

```bash
dsh plugin install dsh-blueprint-tree
```

or install it from the plugin market. After installing, restart DSH Desktop; a **蓝图** tab appears in the panel.

## Quick start

1. 新建项目：任意命令都不带路径，只给项目名（插件内部登记，AI 拿不到绝对路径）。
2. 建单元、连向量、双击单元编辑描述和方法。
3. `test.unit` / `test.blueprint` / `test.project` 三种测试，`run` 跑整项目。

## License

MIT © 2026 meng-lx
