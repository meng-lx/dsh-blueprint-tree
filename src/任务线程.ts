// ─────────────────────────────────────────────────────────────
// 隔离线程（Worker 入口）
//
// 为什么要有它：`run` / `test.*` 会一路调单元方法，方法里一个 `while(true)`
// 就能把调用方卡死，主线程里没有任何办法打断一段同步代码。
// 把这类命令丢进 Worker 跑，主线程拿住 Worker 句柄，`run.stop` 直接
// `terminate()` —— 单元里怎么死循环都能立刻停。
//
// 协议（与 `任务.ts` 一一对应）：
//   收 { 型:'跑', 指令 }
//   发 { 型:'结果', 结果 } / { 型:'异常', 消息 }
// ─────────────────────────────────────────────────────────────

import { parentPort } from 'node:worker_threads'
import { 执行 } from './controller.ts'
import type { 指令 } from './types.ts'

const 口 = parentPort

if (口) {
  口.on('message', (信: { 型?: string; 指令?: 指令 }) => {
    if (!信 || 信.型 !== '跑' || !信.指令) return
    void 执行(信.指令).then(
      (结果) => {
        口.postMessage({ 型: '结果', 结果 })
      },
      (e: unknown) => {
        口.postMessage({ 型: '异常', 消息: e instanceof Error ? e.message : String(e) })
      },
    )
  })
}
