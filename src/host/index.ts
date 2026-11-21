// Host 半边 —— 把命令执行器暴露成一条 HTTP 路由
//
// 用户 2026-11-15（原话）：
//   「开始做界面吧，界面做到侧边栏，和后台的沟通全走做的几个方法，
//     进入插件的地方也放在侧边栏，一层一层做，先做项目相关」
//
// ⇒ Client 不直接碰文件：全部 `POST { cmd, 参数 }` 到这条路由，
//   Host 调 controller.ts 的 执行() —— 和 CLI 走的是同一个入口。
//
// 为什么必须 Host 参与：浏览器读不了盘。项目列表要读 项目登记.json、
// 新建/删除要动磁盘，这些都只能在 Node 里做。
//
// ⚠ 正式 bundle 插件的 Client 不能像动态插件那样直接调 Host（`host.call` 是
//   动态插件专有通道）。官方做法就是 Host 注册一条 fenced HTTP 路由、
//   Client 用 fetch 访问。

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { 执行 } from '../controller.ts'
import { 取命令 } from '../commands.ts'
import { 跑隔离, 强杀, 要不要隔离 } from '../任务.ts'
import { 设AI } from '../ai.ts'

/** 本插件包的根目录（本文件在 src/host/ 下，上两级即包根） */
const PACKAGE_ROOT = join(import.meta.dirname, '..', '..')

/** 唯一的取名处：读本包 package.json 的 name，改包名不用改代码 */
function 读包名(): string {
  try {
    const raw = readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { name?: unknown }
    if (typeof parsed.name === 'string' && parsed.name.length > 0) return parsed.name
  } catch {
    // 读不到就退回占位，绝不让取名失败拖垮插件
  }
  return 'unknown-plugin'
}

export const name = 读包名()

/** `webServer` 不是硬依赖（apply 时可能还没就绪）⇒ 用 ctx.inject 拿，不写进这里 */
export const inject: string[] = []

/** 面板 API 路径。**故意不带包名**：改包名那天这里不用动。 */
export const COMMAND_API_PATH = '/blueprint-tree/api'

// ── 结构松散的 ctx（本插件只碰这几个方法，拿不到也不会崩）──────────────

interface 最小请求 {
  method?: string
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>
}

interface 最小响应 {
  writeHead?: (status: number, headers?: Record<string, string>) => void
  end?: (body?: string) => void
}

interface WebServer {
  register?: (opts: {
    kind: string
    path: string
    handler: (req: 最小请求, res: 最小响应) => void
  }) => () => void
}

// ── DSH 模型服务（只碰 stream / currentSelection，形状松）──────────────

interface 流块 {
  type?: string
  text?: string
  reason?: { kind?: string; failure?: unknown }
}

interface 语言模型 {
  stream?: (options: Record<string, unknown>) => AsyncIterable<流块>
}

interface 默认模型 {
  currentSelection?: () =>
    | { provider?: string; model?: string; reasoningEffort?: string }
    | undefined
}

interface 插件上下文 {
  logger?: { info?(m: string): void }
  inject?: (names: string[], fn: (scope: 插件上下文 & { webServer?: WebServer }) => void) => void
  effect?: (fn: () => unknown, label?: string) => void
  get?: (name: string) => unknown
}

// ── 请求 / 响应 ─────────────────────────────────────────────────────────

async function 读请求体(req: 最小请求): Promise<Record<string, unknown>> {
  if (typeof req[Symbol.asyncIterator] !== 'function') return {}
  const 块: Uint8Array[] = []
  for await (const 段 of req as AsyncIterable<Uint8Array>) 块.push(段)
  const 文本 = Buffer.concat(块).toString('utf8').trim()
  if (!文本) return {}
  try {
    const 解析结果: unknown = JSON.parse(文本)
    return 解析结果 && typeof 解析结果 === 'object' ? (解析结果 as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * 一条路由，一种写法：
 *   POST { cmd: 'project.list', 参数: {} }   →  { ok, 数据 } / { ok:false, 错误 }
 */
function 建处理器(deps: { log(m: string): void }): (req: 最小请求, res: 最小响应) => void {
  return (req, res) => {
    const 回 = (status: number, body: unknown): void => {
      try {
        res.writeHead?.(status, { 'content-type': 'application/json; charset=utf-8' })
        res.end?.(JSON.stringify(body))
      } catch (err) {
        deps.log('写响应失败: ' + String(err))
      }
    }

    void (async () => {
      try {
        if (req.method !== 'POST') {
          回(405, { ok: false, 错误: { 类型: '方法', 消息: '只收 POST' } })
          return
        }
        const 体 = await 读请求体(req)
        const 参数 =
          体.参数 && typeof 体.参数 === 'object' && !Array.isArray(体.参数)
            ? (体.参数 as Record<string, unknown>)
            : {}

        // 运行 / 测试要能强杀：丢进 Worker 跑，主进程留着句柄；
        // 「结束」先把 Worker terminate 掉，再让命令本身写一遍「要求结束」兜底。
        const 命令名 = String(体.cmd ?? '')
        const 正式名 = String(取命令(命令名)?.名 ?? 命令名)
        if (正式名 === 'run.stop') 强杀()
        const 结果 = 要不要隔离(正式名)
          ? await 跑隔离({ cmd: 命令名, 参数 })
          : await 执行({ cmd: 命令名, 参数 })
        回(结果.ok ? 200 : 400, 结果)
      } catch (err) {
        deps.log('API 处理异常: ' + String(err))
        回(500, { ok: false, 错误: { 类型: 'internal', 消息: String(err) } })
      }
    })()
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AI 接线
// ══════════════════════════════════════════════════════════════════════════

/**
 * 把 DSH 自己的 `llm` 服务包成 `问AI`。
 *
 * 用户 2026-11-16：「这个功能不能出现API,目前的想法是先绑定dsh」
 * ⇒ 这里**不读任何 API key、不连任何服务商地址**：模型路由与凭据全由 DSH
 *   管，我们只调 `llm.stream()`，用 `agentDefaultModel.currentSelection()`
 *   拿用户当前选的那个模型（和 mneme 的 createEntityStreamAdapter 同一手法）。
 */
/**
 * 取一个会话 id 当作 llm 调用的身份。
 *
 * 账号型 provider（`deepseek-account`）走的是 DSH 自己的会话通道：`agentLoop`
 * 发请求时会带上 sessionId，插件直接调 `llm.stream` 不传就会 `TRANSPORT`。
 * 优先用当前发起者，其次用第一个活着的 agent。
 */
function 取会话(c: 插件上下文, log?: (m: string) => void): string {
  let ags: unknown
  try {
    ags = c.get?.('agents')
  } catch (err) {
    log?.('agents 服务取失败：' + String((err as Error)?.message ?? err))
    return ''
  }
  if (!ags) {
    log?.('agents 服务为空（c.get("agents") 拿到 undefined）')
    return ''
  }
  const 器 = ags as {
    list?: () => Array<{ id?: string }>
    currentInitiator?: () => { id?: string } | undefined
  }
  try {
    const 现 = 器.currentInitiator?.()
    if (现?.id) return String(现.id)
    log?.('currentInitiator 为空（不在任何 agent 的边界内）')
  } catch (err) {
    log?.('currentInitiator 抛错：' + String((err as Error)?.message ?? err))
  }
  try {
    const 表 = 器.list?.() ?? []
    log?.(`agents.list 数量=${表.length}`)
    return String(表[0]?.id ?? '')
  } catch (err) {
    log?.('agents.list 抛错：' + String((err as Error)?.message ?? err))
    return ''
  }
}

/** 把一次 `llm.stream` 收完，返回文本与失败原因（失败原因原样 JSON）。 */
async function 收一次(
  llm: 语言模型,
  options: Record<string, unknown>,
): Promise<{ 文本: string; 失败: string }> {
  let 文本 = ''
  let 失败 = ''
  for await (const 块 of llm.stream(options as never)) {
    const 块二 = 块 as { type?: string; text?: string; reason?: { kind?: string } }
    if (块二?.type === 'text-delta' && typeof 块二.text === 'string') 文本 += 块二.text
    else if (块二?.type === 'finish' && (块二.reason?.kind === 'error' || 块二.reason?.kind === 'aborted')) {
      try {
        失败 = JSON.stringify(块二.reason)
      } catch {
        失败 = String(块二.reason)
      }
    }
  }
  return { 文本, 失败 }
}

function 接AI(c: 插件上下文, log: (m: string) => void): void {
  // ⚠ 惰性取服务：apply 执行时 `llm` 可能还没就绪，甚至 inject 回调一辈子不触发。
  //   所以这里只登记「用的时候再拿」的函数，不在接线时判空、也不依赖注入时机。
  设AI(async (系统: string, 用户: string): Promise<string> => {
    const llm = c.get?.('llm') as 语言模型 | undefined
    if (!llm || typeof llm.stream !== 'function') {
      throw new Error('AI 没接上：Host 拿不到 llm 服务（插件里 c.get("llm") 是空的）')
    }

    const 默认 = c.get?.('agentDefaultModel') as 默认模型 | undefined
    let 选: { provider?: string; model?: string; reasoningEffort?: string } | undefined
    try {
      选 = 默认?.currentSelection?.()
    } catch {
      /* 拿不到就下面报错，不猜 */
    }
    const provider = 选?.provider
    const model = 选?.model
    if (!provider || !model) throw new Error('没有选模型：先在 DSH 里挑一个模型再试')

    let 文本 = ''
    let 失败原因 = ''
    let 失败详情 = ''
    // ⚠ 消息形状照 dsh-mneme 的 createEntityStreamAdapter：content 是块数组、
    //   不单独传 system 字段、也不传 sessionId。自检实测（2026-11-16 23:00）
    //   只有这个形状能出文本；content 写字符串 / system 写字符串都会在 transport
    //   里抛非 LlmError 的异常，被兜底包成 TRANSPORT（真因藏在 cause 里看不到）。
    //   系统提示并进同一条 user 消息，不再用 system 字段。
    const 问话 = 系统 ? `${系统}\n\n${用户}` : 用户
    for await (const 块 of llm.stream({
      ...选,
      maxTokens: 8192,
      messages: [{ role: 'user', content: [{ type: 'text', text: 问话 }] }],
    } as never)) {
      if (块?.type === 'text-delta' && typeof 块.text === 'string') 文本 += 块.text
      else if (块?.type === 'finish' && (块.reason?.kind === 'error' || 块.reason?.kind === 'aborted')) {
        失败原因 = 块.reason.kind
        try {
          失败详情 = JSON.stringify(块.reason)
        } catch {
          失败详情 = String(块.reason)
        }
      }
    }
    if (!文本 && 失败原因) {
      log(`AI 调用失败：${失败原因} ${失败详情}`)
      throw new Error(`模型没返回内容（${失败原因}${失败详情 ? '：' + 失败详情 : ''}）`)
    }
    if (!文本) {
      log('AI 调用返回了空文本（没有 finish 报错，也没有内容）')
    }
    return 文本
  })

  log('AI 已接线（llm / 模型在真正调用时才取，不依赖注入时机）')
}

// ══════════════════════════════════════════════════════════════════════════
// 入口
// ══════════════════════════════════════════════════════════════════════════

// 模块被 import 时立刻留痕：重启后日志里连这一行都没有 ⇒ 装配层没挂上
console.log(`[${name}] Host 半边已加载 (module evaluated)`)

export function apply(ctx: unknown, _config: Record<string, unknown> = {}): void {
  const c = ctx as 插件上下文
  const 日志文件 = join(PACKAGE_ROOT, '.tmp', 'host.log')
  const log = (m: string): void => {
    const line = `[${name}] ` + m
    try {
      c.logger?.info?.(line)
    } catch {
      /* 日志本身绝不能再抛 */
    }
    try {
      console.log(line)
    } catch {
      /* ignore */
    }
    // 落一份到项目里：桌面版的 stdout 抓不到，排查接线只能看这个文件
    try {
      mkdirSync(join(PACKAGE_ROOT, '.tmp'), { recursive: true })
      appendFileSync(日志文件, new Date().toISOString() + ' ' + line + '\n', 'utf8')
    } catch {
      /* ignore */
    }
  }

  log('apply 已执行')

  // 整块失败只影响面板（浏览器那边看不到项目），不影响 Host 其余部分。
  try {
    c.inject?.(['webServer'], (scope) => {
      const ws = scope.webServer
      if (!ws || typeof ws.register !== 'function') {
        log('webServer 服务不可用，面板 API 未注册')
        return
      }
      try {
        const dispose = ws.register({
          kind: 'prefix',
          path: COMMAND_API_PATH,
          handler: 建处理器({ log }),
        })
        log('面板 API 已注册：' + COMMAND_API_PATH)
        // ⚠ 必须把 disposer 交给 effect：插件卸载/重载时这条路由要跟着消失，
        //   否则下一次 apply 会在同一条路径上再注册一次（重复注册会 throw）。
        c.effect?.(() => dispose, name + ' 面板 API')
      } catch (err) {
        log('注册面板 API 抛错（不影响 Host 其余部分）: ' + String(err))
      }
    })
  } catch (err) {
    log('ctx.inject(webServer) 调用异常（已吞掉，不影响 DSH 启动）: ' + String(err))
  }

  // AI 接线：不依赖 inject 时机 —— `llm` 服务在真正调用时才去取
  // （apply 执行时它可能还没就绪，用 inject 等会一辈子等不到）。
  //
  // ⚠️ Cordis 的 `ctx.effect(fn)` 是「**立刻执行 fn**，把 fn 的返回值当清理器」。
  //    所以这里必须写成 `() => () => 设AI(undefined)`（两层）：
  //    直接写 `() => 设AI(undefined)` 会被当场执行，接线刚设上就被清空
  //    ——日志里 `设AI：接上了` 与 `设AI：清空` 会落在同一毫秒。
  try {
    接AI(c, log)
    c.effect?.(() => () => 设AI(undefined), name + ' AI 接线')
  } catch (err) {
    log('AI 接线失败（不影响其余部分）: ' + String(err))
  }

  // 启动自检：3 秒后用当前路由发一个最小请求。
  // 通道坏在哪（没服务 / 没路由 / transport 失败 / 空文本）一眼能看出来，
  // 不用每一次都跑完整张蓝图才知道。只记日志，绝不抛。
  try {
    setTimeout(() => {
      void (async () => {
        try {
          const llm = c.get?.('llm') as 语言模型 | undefined
          let 选: { provider?: string; model?: string; reasoningEffort?: string } | undefined
          try {
            选 = (c.get?.('agentDefaultModel') as 默认模型 | undefined)?.currentSelection?.()
          } catch {
            /* ignore */
          }
          const 会话 = 取会话(c, log)
          log(
            `自检：provider=${选?.provider ?? '-'} model=${选?.model ?? '-'} effort=${选?.reasoningEffort ?? '-'} 会话=${会话 || '-'}`,
          )
          if (!llm || typeof llm.stream !== 'function' || !选?.provider || !选?.model) {
            log('自检：llm 或路由缺失，跳过')
            return
          }
          const 底 = { ...选, maxTokens: 64 }
          const 问话 = '只回两个字：你好'
          const 试 = async (名: string, 选项: Record<string, unknown>): Promise<string> => {
            const 果 = await 收一次(llm, { ...底, ...选项 } as never)
            log(`自检[${名}]：文本=${JSON.stringify(果.文本.slice(0, 40))} 失败=${果.失败 || '-'}`)
            return 果.文本
          }
          // A：照 mneme（createEntityStreamAdapter）的形状 —— content 是块数组、不带 system
          if (await 试('A块数组', { messages: [{ role: 'user', content: [{ type: 'text', text: 问话 }] }] })) return
          // B：块数组 + system 也用块数组
          if (
            await 试('B块+系统块', {
              system: [{ type: 'text', text: '你是测试助手。' }],
              messages: [{ role: 'user', content: [{ type: 'text', text: 问话 }] }],
            })
          )
            return
          // C：字符串 content（当前 run 里用的形状）
          if (await 试('C字符串', { messages: [{ role: 'user', content: 问话 }] })) return

          // 直连失败 ⇒ 换成「带 initiator 边界」再试一次：
          // 账号型 provider 取凭据靠发起的 agent，边界外调用拿不到。
          const 器 = (() => {
            try {
              return c.get?.('agents')
            } catch {
              return undefined
            }
          })() as
            | {
                list?: () => Array<{ id?: string }>
                withInitiator?: (a: unknown, f: () => unknown) => unknown
              }
            | undefined
          let 首个: { id?: string } | undefined
          try {
            首个 = 器?.list?.()[0]
          } catch {
            /* ignore */
          }
          if (!器 || !首个 || typeof 器.withInitiator !== 'function') {
            log('自检：没有可用的 agent，跳过边界内重试')
            return
          }
          log(`自检：改为在 initiator 边界内重试（agent=${首个.id ?? '-'}）`)
          const 二 = (await 器.withInitiator(首个, () =>
            收一次(llm, {
              ...底,
              messages: [{ role: 'user', content: [{ type: 'text', text: 问话 }] }],
            } as never),
          )) as { 文本: string; 失败: string }
          log(`自检（边界内）：文本=${JSON.stringify(二.文本.slice(0, 40))} 失败=${二.失败 || '-'}`)
        } catch (err) {
          log('自检异常：' + String((err as Error)?.message ?? err))
        }
      })()
    }, 3000)
  } catch {
    /* ignore */
  }
}
