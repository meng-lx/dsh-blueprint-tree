// blueprint.detail —— 查看详细结构
//
// 用户 2026-11-11（第 7 条，原话）：
//   「另一个就是查看详细结构，可以选起点，返回类似蓝图中单元的json格式，
//     包含名称、同步性、功能、上下游，除了上下游都是直接取的」
//
// ⇒ 输出和蓝图里的「单元」同一形状（对象数组，不是行文本）。
//   名 / 同步性 / 功能 都直接读文件；只有 上游 / 下游 是算出来的（蓝图包含关系）。

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 定位项目 } from '../登记表.ts'
import { 生效配置, 产物文件名 } from '../项目.ts'
import type { 蓝图 } from './unit-add.ts'

function 净(s: string): string {
  return s.replace(/[|\r\n]+/g, ' ').trim()
}

function 读图(项目目录: string, 配置: ReturnType<typeof 生效配置>, 名: string): 蓝图 | undefined {
  const p = path.join(项目目录, 产物文件名(配置, 名).蓝图)
  if (!fs.existsSync(p)) return undefined
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as 蓝图
  } catch {
    return undefined
  }
}

type 节点 = {
  名: string
  /** 直接读文件里的字段；老文件可能没有 */
  同步性: 0 | 1 | null
  /** 父图里那个子蓝图单元的「功能」；起点自己写 - */
  功能: string
  /** 谁包含我 */
  上游: Set<string>
  /** 我包含谁（按父图里的单元顺序） */
  下游: string[]
  缺文件: boolean
}

export const 看详情: 命令定义 = {
  名: 'blueprint.detail',
  说明:
    '查看详细结构：每张图一条（名 / 同步性 / 功能 / 上游 / 下游），和蓝图里单元的 json 一个形状。上下游是蓝图的包含关系',
  中文: ['查看详细结构', '详细结构', '结构详情', '蓝图详情', '详细查看'],
  执行(参数): 结果 {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const { 项目名, 项目目录, 项 } = 定.数据

    const 配置 = 生效配置(项目名, 项目目录)
    const 起点 = String(参数.蓝图 ?? 项.蓝图 ?? 配置.蓝图.默认名)
      .trim()
      .replace(/\.json$/i, '')
    if (!起点) return 失败('参数', '「蓝图」不能是空的', '蓝图')
    if (!读图(项目目录, 配置, 起点)) {
      return 失败('不存在', `没有叫「${起点}」的蓝图`, 起点)
    }

    const 表 = new Map<string, 节点>()
    const 顺序: string[] = []

    // 层数：不传 = 全展开；传了必须 >= 1
    const 层数参数 = 参数.层数
    const 层数 = 层数参数 === undefined ? Infinity : Number(层数参数)
    if (层数参数 !== undefined && (!Number.isFinite(层数) || 层数 < 1)) {
      return 失败('参数', '「层数」必须是 >= 1 的数字（不传 = 全展开）', '层数')
    }

    const 走 = (名: string, 父: string | undefined, 描述: string, 层: number): void => {
      let 节 = 表.get(名)
      if (!节) {
        const 图 = 读图(项目目录, 配置, 名)
        节 = {
          名,
          同步性: 图 && (图.同步性 === 0 || 图.同步性 === 1) ? 图.同步性 : null,
          功能: 描述 ? 净(描述) : '-',
          上游: new Set(),
          下游: [],
          缺文件: false,
        }
        表.set(名, 节)
        顺序.push(名)
      }
      if (父) 节.上游.add(父)
      if (节.功能 === '-' && 描述) 节.功能 = 净(描述)
      // 已经展开过就只补上游，不再往下走（防环）
      if (节.下游.length || 节.缺文件) return

      const 图 = 读图(项目目录, 配置, 名)
      if (!图) {
        节.缺文件 = true
        return
      }
      const 子 = (图.单元 ?? []).filter((u) => u.类型 === '子蓝图')
      节.下游 = 子.map((u) => u.名)
      // 到顶了：下游名字已经填了，但不再往下展开
      if (层 + 1 >= 层数) return
      for (const u of 子) 走(u.名, 名, u.功能 ?? '', 层 + 1)
    }

    走(起点, undefined, '', 0)

    const 蓝图们 = 顺序.map((名) => {
      const 节 = 表.get(名)!
      const 上 = 节.上游.size ? [...节.上游].join(',') : '-'
      const 下 = 节.下游.length ? 节.下游.join(',') : '-'
      const 功能 = 节.缺文件 ? '(缺文件)' : 节.功能
      return {
        名,
        同步性: 节.同步性,
        功能,
        上游: 上,
        下游: 下,
      }
    })

    return 成功({
      起点,
      ...(层数 === Infinity ? {} : { 层数 }),
      蓝图数: 顺序.length,
      蓝图: 蓝图们,
    })
  },
}
