// ─────────────────────────────────────────────────────────────
// 可强杀的任务（页面里的「运行 / 测试」）
//
// 用户 2026-11-18：「只要求能强杀测试和运行，其他不用动」。
//
// 做法：只把这四条命令丢进 Worker（`任务线程.ts`）跑，主进程持有 Worker；
// `run.stop` 直接 `terminate()` —— 单元里 `while(true)` 也能立刻停。
// 其余命令不进线程：它们要么很短，要么要直接改文件，thread 化没有收益。
//
// 2026-11-26：两个竞态修正 ——
//   ① 旧任务的 `finally` 无条件清空 `当前工`，会把已经在跑的**新任务**的引用抹掉
//      （实测：停 A → 立刻启 B → A 收尾 ⇒ B 查不到也停不了）。改成只清「还是自己的」。
//   ② 被主动强杀的线程，`exit` 码可能是 0（还没开始跑就被 terminate），
//      以前按退出码判成「线程提前退出」。改成按**主动取消标记**判定「中止」。
// ─────────────────────────────────────────────────────────────

import { Worker } from 'node:worker_threads'
import type { 指令, 结果 } from './types.ts'
import { 失败 } from './types.ts'

/** 需要能强杀的命令（按正式名） */
export const 隔离命令 = new Set(['run', 'test.unit', 'test.blueprint', 'test.project'])

/** 线程的最小接口：真 Worker 与测试里的假线程都满足 */
export interface 线程 {
  once(事件: 'message' | 'error' | 'exit', 回调: (...参数: never[]) => void): unknown
  postMessage(值: unknown): void
  terminate(): unknown
}

let 当前工: 线程 | null = null
let 当前命令 = ''

/** 被主动强杀的线程（`exit` 码不可靠，用它判定「中止」） */
const 取消的 = new WeakSet<object>()

let 造线程 = (): 线程 => new Worker(new URL('./任务线程.ts', import.meta.url)) as unknown as 线程

/** 测试用：替换线程工厂；不传则恢复真 Worker */
export function 换线程工厂(工厂?: () => 线程): void {
  造线程 = 工厂 ?? ((): 线程 => new Worker(new URL('./任务线程.ts', import.meta.url)) as unknown as 线程)
}

/** 这条命令要不要丢进线程 */
export function 要不要隔离(命令名: string): boolean {
  return 隔离命令.has(命令名)
}

/** 现在有隔离任务在跑吗（界面/状态用） */
export function 有隔离任务(): boolean {
  return 当前工 !== null
}

/** 强杀正在跑的隔离任务；返回「真的杀掉了一个」 */
export function 强杀(): boolean {
  const 工 = 当前工
  if (!工) return false
  // 先打标：线程可能还没来得及跑就被 terminate，`exit` 码会报 0
  取消的.add(工 as unknown as object)
  当前工 = null
  当前命令 = ''
  try {
    void 工.terminate()
  } catch {
    /* 已经没了 */
  }
  return true
}

/** 在独立线程里跑一条命令；被强杀时返回 `{ ok:false, 错误:中止 }` */
export async function 跑隔离(指令: 指令): Promise<结果> {
  const 名 = String(指令.cmd ?? '')
  if (当前工) return 失败('忙', `上一个「${当前命令}」还在跑，先点停止`, '任务')

  const 工 = 造线程()
  当前工 = 工
  当前命令 = 名
  let 已收 = false
  const 被取消 = (): boolean => 取消的.has(工 as unknown as object)

  try {
    return await new Promise<结果>((完成) => {
      const 收 = (r: 结果): void => {
        if (已收) return
        已收 = true
        完成(r)
      }
      工.once('message', (信: { 型?: string; 结果?: 结果; 消息?: string }) => {
        if (信?.型 === '结果') 收(信.结果 as 结果)
        else if (信?.型 === '异常') 收(失败('运行', 安全文本(信.消息 ?? '线程异常'), 名))
        else 收(失败('运行', '线程回了不认识的消息', 名))
      })
      工.once('error', (e: unknown) => {
        收(失败('运行', 安全文本(e), 名))
      })
      工.once('exit', (码: number) => {
        // 正常收尾由 message 先到达；走到这里说明线程没了还没交结果
        if (已收) return
        // 主动强杀的：不管退出码是 0 还是别的，都算「中止」
        if (被取消()) 收(失败('中止', '任务已被强制停止', 名))
        else 收(码 === 0 ? 失败('运行', '线程提前退出，没有结果', 名) : 失败('中止', '任务已被强制停止', 名))
      })
      try {
        工.postMessage({ 型: '跑', 指令 })
      } catch (e) {
        收(失败('运行', 安全文本(e), 名))
      }
    })
  } finally {
    取消的.delete(工 as unknown as object)
    // 只清「还是自己」的引用：旧任务收尾不能把新任务的引用抹掉（2026-11-26 竞态）
    if (当前工 === 工) {
      当前工 = null
      当前命令 = ''
    }
    try {
      void 工.terminate()
    } catch {
      /* 已经没了 */
    }
  }
}

/** 把任意值变成文本：`Object.create(null)` 这种没有原型的对象也要能转 */
function 安全文本(值: unknown): string {
  if (值 instanceof Error) return 值.message
  if (typeof 值 === 'string') return 值
  try {
    return String(值)
  } catch {
    try {
      return JSON.stringify(值) ?? '未知错误'
    } catch {
      return '未知错误（无法转成文本）'
    }
  }
}
