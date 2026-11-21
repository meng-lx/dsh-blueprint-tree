// ─────────────────────────────────────────────────────────────
// AI 写手：把「问一次模型」做成一个可替换的函数
//
// 用户 2026-11-16（原话）：
//   「没有方法时,用单元说明调用ai,这个功能不能出现API,
//     目前的想法是先绑定dsh,通过子代理或者别的方式处理,
//     至于返回值类型就是长字符串,把结果全塞进去给」
//
// ⇒ 插件自己**不配 API key、不直连任何服务商**。Host 半边在 apply 时把
//   DSH 的 `llm` 服务（以及 `agentDefaultModel` 里当前选的模型路由）
//   包成 `问(系统, 用户) => Promise<string>` 塞进来；命令层只认这个函数。
//
// 为什么放在模块级而不是命令参数里：命令的签名是 `执行(参数)`，参数来自
// AI 工具调用 / HTTP，不能把函数塞进去。接线一次，全局可用。
//
// ⚠️ 槽位挂在 globalThis 上，不是模块变量 —— 插件可能被以不同 URL 加载
//   （symlink、打包、重复求值），模块级变量会分裂成两份：Host 那边设了，
//   命令这边看到的是空槽，表现就是「已接线却报没接上」。
//
// ⚠️ 没接线时不要假装能答：`有AI()` 为 false 时命令直接报错，让用户去
//   重启 DSH（Host 半边没挂上 llm）——比悄悄返回空字符串好排查。
// ─────────────────────────────────────────────────────────────

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** 问模型一次，返回**整段长字符串**（流式拼起来的全文） */
export type AI问 = (系统: string, 用户: string) => Promise<string>

const 槽 = '__dsh_flow_v3_AI__'

/** 排错用：模块可能被求值多次，每次留一行带 URL 的痕 */
function 日志(行: string): void {
  try {
    const dir = join(import.meta.dirname, '..', '.tmp')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'ai.log'), `${new Date().toISOString()} [ai.ts] ${行}\n`, 'utf8')
  } catch {
    /* 日志不能反过来拖垮调用 */
  }
}

try {
  console.log('[dsh-blueprint-tree] ai.ts 模块已求值: ' + import.meta.url)
} catch {
  /* ignore */
}
日志('模块求值')

function 取槽(): AI问 | undefined {
  const fn = (globalThis as Record<string, unknown>)[槽]
  return typeof fn === 'function' ? (fn as AI问) : undefined
}

/** Host 半边接线；传 undefined 表示断开（插件卸载） */
export function 设AI(fn: AI问 | undefined): void {
  ;(globalThis as Record<string, unknown>)[槽] = fn
  日志(fn ? '设AI：接上了' : '设AI：清空')
}

/** 有没有接上 AI */
export function 有AI(): boolean {
  return 取槽() !== undefined
}

/** 问一次。没接线就抛错，由命令层折成 { ok:false } */
export async function 问AI(系统: string, 用户: string): Promise<string> {
  const fn = 取槽()
  if (!fn) {
    日志('问AI：槽是空的（Host 没接线，或模块不是同一份）')
    throw new Error('AI 没接上：Host 半边的 llm 服务不可用（重启 DSH 试试）')
  }
  const 文本 = await fn(系统, 用户)
  return typeof 文本 === 'string' ? 文本 : String(文本 ?? '')
}
