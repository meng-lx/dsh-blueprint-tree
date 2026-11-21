// ─────────────────────────────────────────────────────────────
// 可强杀的任务（页面里的「运行 / 测试」）
//
// 用户 2026-11-18：「只要求能强杀测试和运行，其他不用动」。
//
// 做法：只把这四条命令丢进 Worker（`任务线程.ts`）跑，主进程持有 Worker；
// `run.stop` 直接 `terminate()` —— 单元里 `while(true)` 也能立刻停。
// 其余命令不进线程：它们要么很短，要么要直接改文件，thread 化没有收益。
// ─────────────────────────────────────────────────────────────

import { Worker } from 'node:worker_threads'
import type { 指令, 结果 } from './types.ts'
import { 失败 } from './types.ts'

/** 需要能强杀的命令（按正式名） */
export const 隔离命令 = new Set(['run', 'test.unit', 'test.blueprint', 'test.project'])

let 当前工: Worker | null = null
let 当前命令 = ''

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

  const 工 = new Worker(new URL('./任务线程.ts', import.meta.url))
  当前工 = 工
  当前命令 = 名
  let 已收 = false

  try {
    return await new Promise<结果>((完成) => {
      const 收 = (r: 结果): void => {
        if (已收) return
        已收 = true
        完成(r)
      }
      工.once('message', (信: { 型?: string; 结果?: 结果; 消息?: string }) => {
        if (信?.型 === '结果') 收(信.结果 as 结果)
        else if (信?.型 === '异常') 收(失败('运行', String(信.消息 ?? '线程异常'), 名))
        else 收(失败('运行', '线程回了不认识的消息', 名))
      })
      工.once('error', (e: unknown) => {
        收(失败('运行', e instanceof Error ? e.message : String(e), 名))
      })
      工.once('exit', (码: number) => {
        // 正常收尾由 message 先到达；走到这里说明线程没了还没交结果
        if (已收) return
        收(码 === 0 ? 失败('运行', '线程提前退出，没有结果', 名) : 失败('中止', '任务已被强制停止', 名))
      })
      try {
        工.postMessage({ 型: '跑', 指令 })
      } catch (e) {
        收(失败('运行', e instanceof Error ? e.message : String(e), 名))
      }
    })
  } finally {
    当前工 = null
    当前命令 = ''
    try {
      void 工.terminate()
    } catch {
      /* 已经没了 */
    }
  }
}
