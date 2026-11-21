// ─────────────────────────────────────────────────────────────
// 控制器
//
// 用户 2026-11-07 定的流程：
//     收到指令 → 校验操作（目前全通过）→ 操作文件
//
// AI（工具调用）和界面（HTTP）都只调这里，两边都不直接碰文件。
// ─────────────────────────────────────────────────────────────

import type { 指令, 结果 } from './types.ts'
import { 失败, 成功 } from './types.ts'
import { 校验 } from './validate.ts'
import { 取命令 } from './commands.ts'
import { 读登记表, 查项目 } from './登记表.ts'
import { 同步项目方法 } from './方法同步.ts'
import { 生效配置 } from './项目.ts'
import { 编辑上下文 } from './编辑上下文.ts'

/** 环境变量取值：新名优先，旧名（flow-v3 时代）兼容 */
function 环境值(新名: string, 旧名: string): string {
  return String(process.env[新名] ?? process.env[旧名] ?? '').trim()
}

/** 格式化项目名（后端换过去以后，命令都点火这张主蓝图跑） */
function 格式化项目(): string {
  return 环境值('BLUEPRINT_TREE_格式化项目', 'FLOW3_格式化项目') || 'blueprint-tree格式化'
}

/** 后端走蓝图（用户 2026-11-17：测试没问题就把后端替换成格式化好的）
 *
 *  2026-11-17 晚：四组命令（项目/单元/蓝图/方法）共 30 个对比用例全部一致，
 *  所以默认就走进蓝图的格式化链路；要退回 TS 实现，设 `BLUEPRINT_TREE_BACKEND=ts`。 */
function 走蓝图(): boolean {
  return 环境值('BLUEPRINT_TREE_BACKEND', 'FLOW3_BACKEND').toLowerCase() !== 'ts'
}

/** 格式化项目在登记表里吗（单元测试用临时 BLUEPRINT_TREE_HOME，登记表是空的 ⇒ 自动退回 TS） */
function 有格式化项目(): boolean {
  try {
    const 表 = 读登记表() as { 项目?: Record<string, unknown> }
    return Boolean(表?.项目 && 格式化项目() in 表.项目)
  } catch {
    return false
  }
}

/** unit.get / unit.add 回来后补上编辑器要的上下文（项目描述 / 子蓝图单元 / 上游+功能）
 *
 *  用户 2026-11-21：编辑弹窗要显示项目描述、当前子蓝图对应的子蓝图单元描述，
 *  上游列表要把父图那个子蓝图单元也算进去。这些都能从蓝图文件现算，
 *  不必进链路占格子，所以放在控制器这一层兜底。 */
function 补编辑上下文(命令名: string, 参数: Record<string, unknown>, 结果: 结果): 结果 {
  if (命令名 !== 'unit.get' && 命令名 !== 'unit.add') return 结果
  if (!结果 || !结果.ok) return 结果
  const 数据 = (结果.数据 ?? {}) as Record<string, unknown>
  const 项目 = String(参数.项目 ?? '')
  const 蓝图 = String(数据.蓝图 ?? 参数.蓝图 ?? '')
  const 单元 = String((数据.单元 as Record<string, unknown> | undefined)?.名 ?? 参数.单元 ?? '')
  const 登记 = 查项目(项目)
  if (!登记 || !蓝图 || !单元) return 结果
  try {
    const 配置 = 生效配置(项目, 登记.路径)
    const 上下文 = 编辑上下文(登记.路径, 配置, 蓝图, 单元)
    return { ...结果, 数据: { ...数据, ...上下文 } }
  } catch {
    return 结果
  }
}

/** 执行一条指令。永不抛错，一切异常都折成 { ok:false } */
export async function 执行(指令: 指令): Promise<结果> {
  if (!指令 || typeof 指令.cmd !== 'string') {
    return 失败('参数', '缺少 cmd', 'cmd')
  }

  const 命令 = 取命令(指令.cmd)
  if (!命令) {
    return 失败('未知命令', `不认识的命令：${指令.cmd}`, 'cmd')
  }

  const 参数 = 指令.参数 ?? {}

  // ① 校验（在碰任何文件之前）
  const 校验结果 = 校验(命令.名, 参数)
  if (!校验结果.ok) return 校验结果

  // ①.5 界面自检命令（page.*）：刷新没有业务语义，不进蓝图链路，直接走 TS。
  //     否则「刷新」也得在链路里占一格，测试和校验会跟着变。
  //     method.brief 同理：只把上下文念给 AI 听（读文件 + 类型推断），不写业务。
  if (String(命令.名).startsWith('page.') || String(命令.名) === 'method.brief') {
    try {
      return await 命令.执行(参数)
    } catch (e) {
      return 失败('IO', e instanceof Error ? e.message : String(e))
    }
  }

  // ② 走格式化链路：点火那张主蓝图，让蓝图里的单元把活干完，
  //    再把链尾包里的「结果」映射回原来 { ok, 数据 } 的形状。
  //    run / 蓝图自己跑自己 这两种情况直接走 TS，免得套娃。
  if (走蓝图() && 有格式化项目() && 指令.cmd !== 'run' && !(参数 as Record<string, unknown>).蓝图内部) {
    const 回 = await 执行({
      cmd: 'run',
      // 命令参数摊平进 run 的参数袋：蓝图格子里读 包.参数.单元 拿到的就是命令自己的参数，
      // 与 TS 命令收到的是同一份（之前多包一层 参数，格子全读到 undefined）。
      // 命令名传「正式名」而不是用户敲的别名（「创建项目」→ `project.create`），
      // 否则格子的闸门对不上，回来就是「蓝图里没有认领」。
      // 命令自己的参数原样放进 参数.参数：run 自己的 项目 是「跑哪张图」，「被测项目」
      // 是命令参数里的 项目，两者不能互相覆盖（之前平铺导致 测试全项目 跑错图）。
      参数: { 项目: 格式化项目(), 参数, 命令: 命令.名, 返回包: true, 蓝图内部: true },
    })
    if (!回.ok) return 回
    const 数据 = (回.数据 ?? {}) as Record<string, unknown>
    const 包 = (数据.包 ?? {}) as Record<string, unknown>
    const 错 = 包.错
    if (错 && typeof 错 === 'object') {
      const e = 错 as Record<string, unknown>
      return 失败(String(e.类型 ?? '校验'), String(e.消息 ?? ''), e.位置 === undefined ? undefined : String(e.位置))
    }
    if (错) return 失败('校验', String(错), 指令.cmd)
    if (!('结果' in 包)) return 失败('运行', `蓝图里没有认领「${指令.cmd}」这个命令`, 指令.cmd)
    // 链路改完结构之后，方法文件的取数行跟着重算（TS 命令自己会做，链路这层兜底）
    if (/^(unit\.|project\.create)/.test(String(命令.名)) || String(命令.名).startsWith('蓝图')) {
      try {
        const p = 参数 as Record<string, unknown>
        同步项目方法(String(p.项目 ?? 包.项目 ?? ''), p.蓝图 === undefined ? undefined : String(p.蓝图))
      } catch {
        /* 同步失败不影响命令结果 */
      }
    }
    // blueprint.validate 这种「有错但也要把数据交回去」的命令：格子把失败折进 包.失败
    const 败 = 包.失败
    if (败 && typeof 败 === 'object') {
      const e = 败 as Record<string, unknown>
      return {
        ok: false,
        错误: {
          类型: String(e.类型 ?? '校验'),
          消息: String(e.消息 ?? ''),
          位置: e.位置 === undefined ? undefined : String(e.位置),
        },
        数据: (包.结果 ?? {}) as Record<string, unknown>,
      } as 结果
    }
    return 补编辑上下文(
      String(命令.名),
      参数 as Record<string, unknown>,
      成功((包.结果 ?? {}) as Record<string, unknown>),
    )
  }

  // ③ 操作文件
  try {
    const 结果 = await 命令.执行(参数)
    return 补编辑上下文(String(命令.名), 参数 as Record<string, unknown>, 结果)
  } catch (e) {
    return 失败('IO', e instanceof Error ? e.message : String(e))
  }
}

export { 命令清单 } from './commands.ts'
export type { 指令, 结果 } from './types.ts'
