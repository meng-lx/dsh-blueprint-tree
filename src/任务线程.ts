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
//   AI 反向调用（用户 m19802）：
//     发 { 型:'问AI', id, 系统, 用户 }
//     收 { 型:'AI回', id, 文本?, 错误? }
//   —— AI 接线挂在 Host 主进程（`src/host/index.ts` 调 `设AI`），Worker 里的
//   `src/ai.ts` 是另一份模块、槽是空的；不桥过去的话，页面启动的 Worker 里
//   所有「没方法的单元交给 AI 处理」都会失败。
// ─────────────────────────────────────────────────────────────

import { parentPort } from 'node:worker_threads'
import { 执行 } from './controller.ts'
import { 设AI } from './ai.ts'
import type { 指令 } from './types.ts'

const 口 = parentPort

if (口) {
  // ── AI 反向调用桥 ──
  let 下一个 = 0
  const 等的 = new Map<string, (回: { 文本?: string; 错误?: string }) => void>()

  口.on('message', (信: { 型?: string; id?: string; 文本?: string; 错误?: string; 指令?: 指令 }) => {
    if (信?.型 === 'AI回') {
      const 交 = 等的.get(String(信.id ?? ''))
      if (交) {
        等的.delete(String(信.id ?? ''))
        交({ 文本: 信.文本, 错误: 信.错误 })
      }
      return
    }
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

  设AI(
    (系统: string, 用户: string): Promise<string> =>
      new Promise<string>((收, 拒) => {
        if (!口) {
          拒(new Error('隔离线程里没有宿主通道，问不了 AI'))
          return
        }
        const id = String(++下一个)
        等的.set(id, (回) => {
          if (回.错误 !== undefined) 拒(new Error(回.错误))
          else 收(String(回.文本 ?? ''))
        })
        口.postMessage({ 型: '问AI', id, 系统, 用户 })
      }),
  )
}
