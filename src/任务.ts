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
import { 问AI } from './ai.ts'

/** 需要能强杀的命令（按正式名） */
export const 隔离命令 = new Set(['run', 'test.unit', 'test.blueprint', 'test.project'])

/** 线程的最小接口：真 Worker 与测试里的假线程都满足 */
export interface 线程 {
  on(事件: 'message' | 'error' | 'exit', 回调: (...参数: never[]) => void): unknown
  once(事件: 'message' | 'error' | 'exit', 回调: (...参数: never[]) => void): unknown
  postMessage(值: unknown): void
  terminate(): unknown
}

let 当前工: 线程 | null = null
let 当前命令 = ''
/** 当前这条隔离任务是替哪个项目跑的（停止请求要能核对归属，用户 m19432） */
let 当前项目 = ''
/** 当前这条隔离任务是哪一次运行（停止请求要能核对「是不是这一趟」，用户 m19572） */
let 当前运行 = ''

/** 被主动强杀的线程（`exit` 码不可靠，用它判定「中止」） */
const 取消的 = new WeakSet<object>()

/**
 * 「还没开跑就被点了停止」——用户 m19802 的复现：请求体还没收全时，同 ID 的
 * `run.stop` 先到，那时 Worker 还没登记，停止请求就丢了，随后 Worker 照样启动。
 *
 * 做法：先到、又没有任务在跑的停止请求记在这里（键 = 项目 + 运行标识）；
 * 等那一条真的 `跑隔离` 起来时立刻中止它。页面生成的标识一回一换，所以不会
 * 误伤后来的运行；老数据（不带标识）不记，免得停掉随后的任意一趟。
 */
const 待取消 = new Map<string, number>()
const 待取消上限毫秒 = 30_000

function 待取消键(项目: string, 运行: string): string {
  return 项目 + '\u0000' + 运行
}

/** 测试/收尾用：清空待取消记录 */
export function 清待取消(): void {
  待取消.clear()
}

/** 记下一条「还没开跑就被点了停止」的请求 */
export function 记待取消(项目: string, 运行: string): void {
  if (!运行) return
  const 现在 = Date.now()
  for (const [键, 时] of 待取消) if (现在 - 时 > 待取消上限毫秒) 待取消.delete(键)
  待取消.set(待取消键(项目, 运行), 现在)
}

/** 这一条是不是早被点过停止（取走即消费） */
function 消耗待取消(项目: string, 运行: string): boolean {
  if (!运行) return false
  const 键 = 待取消键(项目, 运行)
  const 有 = 待取消.has(键)
  待取消.delete(键)
  return 有
}

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

/**
 * 强杀正在跑的隔离任务；返回「真的杀掉了一个」。
 *
 * 用户 m19432：停止请求带了项目就要核对归属 —— 停 B 不能把正在跑的 A 杀掉。
 * 不带项目是老的用法（界面上的「结束」不带项目时会走到这里），只有当池里
 * 没有任务时才安全；有任务时调用方应当先解析项目。
 */
export function 强杀(项目?: string, 运行?: string): boolean {
  const 工 = 当前工
  if (!工) return false
  if (项目 !== undefined && 项目 !== '' && 项目 !== 当前项目) return false
  // 用户 m19572：请求带了运行标识就核对 —— 指向旧运行 r1 的迟到请求不能停掉 r2
  if (运行 !== undefined && 运行 !== '' && 运行 !== 当前运行) return false
  // 先打标：线程可能还没来得及跑就被 terminate，`exit` 码会报 0
  取消的.add(工 as unknown as object)
  当前工 = null
  当前命令 = ''
  当前项目 = ''
  当前运行 = ''
  try {
    void 工.terminate()
  } catch {
    /* 已经没了 */
  }
  return true
}

/** 当前在跑的那条任务属于哪个项目（空串 = 没有任务） */
export function 在跑的项目(): string {
  return 当前工 ? 当前项目 : ''
}

/** 当前在跑的那一次运行的标识（空串 = 没有任务 / 不知道标识） */
export function 在跑的运行(): string {
  return 当前工 ? 当前运行 : ''
}

/** 在独立线程里跑一条命令；被强杀时返回 `{ ok:false, 错误:中止 }` */
export async function 跑隔离(指令: 指令): Promise<结果> {
  const 名 = String(指令.cmd ?? '')
  if (当前工) return 失败('忙', `上一个「${当前命令}」还在跑，先点停止`, '任务')

  const 工 = 造线程()
  当前工 = 工
  当前命令 = 名
  当前项目 = String((指令.参数 as Record<string, unknown> | undefined)?.项目 ?? '')
  当前运行 = String((指令.参数 as Record<string, unknown> | undefined)?.本次运行 ?? '')
  let 已收 = false
  const 被取消 = (): boolean => 取消的.has(工 as unknown as object)
  // 启动前就被点过停止 ⇒ 立刻中止，别让它真的跑起来（用户 m19802）
  const 开跑即停 = 消耗待取消(当前项目, 当前运行)

  try {
    return await new Promise<结果>((完成) => {
      const 收 = (r: 结果): void => {
        if (已收) return
        已收 = true
        完成(r)
      }
      const 回AI = (id: string, 文本?: string, 错误?: string): void => {
        try {
          工.postMessage({ 型: 'AI回', id, 文本, 错误 })
        } catch {
          /* 线程已经没了 */
        }
      }
      工.on('message', (信: { 型?: string; id?: string; 系统?: string; 用户?: string; 结果?: 结果; 消息?: string }) => {
        // 用户 m19802：Worker 里的 AI 槽是空的（Host 的接线在主进程），
        // 这里替它问一次再把答案送回去。
        if (信?.型 === '问AI') {
          const id = String(信.id ?? '')
          void 问AI(String(信.系统 ?? ''), String(信.用户 ?? '')).then(
            (文本) => 回AI(id, 文本),
            (e: unknown) => 回AI(id, undefined, 安全文本(e)),
          )
          return
        }
        // 用户 m19432：已经取消的任务，迟到的结果不能报成功
        if (被取消()) {
          收(失败('中止', '任务已被强制停止', 名))
          return
        }
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
      if (开跑即停) {
        取消的.add(工 as unknown as object)
        try {
          void 工.terminate()
        } catch {
          /* 已经没了 */
        }
        收(失败('中止', '任务还没开始就被停止请求叫停了', 名))
        return
      }
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
      当前项目 = ''
      当前运行 = ''
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
