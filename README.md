# Blueprint Tree for DeepSeek Harness

**Give AI a map to work from, and give yourself a map to review.**

[中文说明](./README.zh.md)

Blueprint Tree is a visual workflow plugin for [DeepSeek Harness](https://github.com/deepseek-ai/dsh). Turn recurring workflows into executable diagrams: connect units to show where data comes from and what consumes it next. Organize related steps in nested blueprints to keep the parent flow readable, then open a unit to inspect its description and TypeScript method.

For example, draw **Import → Clean → Export**, with **Clean** as a nested blueprint. To change a cleaning rule, open that blueprint and inspect the relevant units. If the fields passed to **Export** change, check the downstream unit too. The diagram gives you a place to start reviewing without reconstructing the workflow from a conversation.

## Get started

1. Install `dsh-blueprint-tree` from the DeepSeek Harness plugin store, then open the **蓝图** (Blueprint) panel.
2. Create a project, connect a few units, and describe what each one receives and returns. Double-click a nested blueprint to open it.
3. Open a unit to inspect or edit its method. Use **测试** (Test) on a selected unit before using **项目测试** (Project test) or **运行** (Run) on the whole workflow.

AI method generation uses your configured model and sends the unit description and related blueprint context, such as the names of connected units and upstream descriptions. Review and test generated code before using it with real data.

Use Blueprint Tree for workflows you need to run, revisit, and review. Keep Git for code diffs and rollback.

## License

MIT © 2026 meng-lx
