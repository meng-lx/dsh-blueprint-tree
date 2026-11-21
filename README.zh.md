# dsh-blueprint-tree

> 把思维链变成一张能保存、能验证的蓝图。DeepSeek Harness 的可视化工作流插件。

![类型→形状，标签→边框，状态→填充](https://img.shields.io/badge/%E5%BD%A2%E7%8A%B6-%E7%B1%BB%E5%9E%8B-blue) ![state](https://img.shields.io/badge/%E5%A1%AB%E5%85%85-%E7%8A%B6%E6%80%81-green)

## 它解决什么

思维链是隐式的：上下文一长、话题一换，前面的结构就没了；同一套思路想第二天再用，只能重新想一遍。蓝图把这条链**显式地画出来、存下来**：

- **单元**（节点）= 一步；**向量**（箭头）= 依赖；
- 每格只看得到的输入，边界由拓扑固定；
- 方法正文是 TypeScript，插件按上游自动生成带类型的取数行；
- 同一张图，既能交给引擎跑，也能由 AI 自己当状态机走。

## 三层

| 层 | 装什么 | 谁写 |
| --- | --- | --- |
| 插件层 | 状态机、共享数据 `GONGXIANG`、图算法、检查表 | 插件（写死） |
| 蓝图·子蓝图层 | `flow.json`、子蓝图 `*.json` | 人和 AI 都用命令改 |
| 方法层 | `*.方法.ts`、`*.方法历史.ts` | AI 写正文，插件生成骨架和取数行 |

## 单元

- **类型**：开始 / 结束 / 软 / 硬 / 选择 / 子蓝图（决定形状，不可改）
- **标签**：强制 / 广播 / 并发（决定边框）
- **状态**：正常 / 提醒 / 报错 / 废弃 / 失效 / 断联（决定填充色；`废弃` 就是回收站，`断联` 指走不到开始或结束、测试时跳过）
- **子蓝图**：把一张图收进一个格子，树状嵌套；除根外每张子蓝图都对应父图里的一个子蓝图单元

## 方法

```ts
async "甲"(输入: 上游输入[]) {
    //↓生成单元或上游变动时插件自动生成,能看不能改
    const 上游_开始 = 输入.find((i) => i.来源 === "开始")?.数据 as {
        //**
        x: number;
    } | undefined;
    /*从这里开始***/
    const y: number = (上游_开始?.x ?? 0) + 1;
    return { y: y };
}
```

- 取数行由插件生成，**不许人/AI 改**；上游契约变了会自动重写，并把下游标 `提醒`。
- 正文写空 = 把方法重置成骨架（旧版本进历史，不删方法）。

## 常用命令

```text
project.create/list/remove/add
unit.add/update/remove/get/status
method.write/restore/generate/brief
blueprint.show/tree/detail/validate/between/graph/arrange
run / run.stop
test.unit / test.blueprint / test.project
```

命令只收**项目名**，返回里不带路径 —— 避免 AI 绕过插件直接改文件。

## 安装

DSH Desktop 里：

```bash
dsh plugin install dsh-blueprint-tree
```

装完重启 DSH Desktop，面板里出现「蓝图」标签页。也可以在插件市场里搜 `dsh-blueprint-tree`。

## 测试与运行

| 命令 | 含义 |
| --- | --- |
| `test.unit` | 只跑一格：随机（或手填）造上游输入，跑完即止 |
| `test.blueprint` | 跑一张图，到这张图的 `$结束` 就收工，不回溯父图 |
| `test.project` | 跑整项目，等同一次真实运行 |
| `run` | 真跑：跳过 报错/废弃/失效/断联 的单元 |

测试通过写 `正常`、失败写 `报错`；运行时出错写 `失效`。

## 许可

MIT © 2026 meng-lx
