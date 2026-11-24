// 方法层共用的东西
//
// 每个蓝图（含子蓝图）各有一对方法文件：
//   {蓝图}.方法.ts        当前版本   export const 方法 = { "单元名"(输入) { ... } }
//   {蓝图}.方法历史.ts     旧版本     export const 方法历史 = { "单元名#时间戳"(输入) { ... } }
//
// 键 = 单元名；历史键 = 单元名#时间戳。时间戳格式 YYYYMMDD-HHMMSS ——
// 要求「字典序 == 时间序」，这样挑最近那条只要取字符串最大的。

import fs from 'node:fs'
import path from 'node:path'
import type { 项目配置 } from './项目.ts'
import { 生效配置, 第三层项目配置, 产物文件名, 配置路径 } from './项目.ts'
import { 定位项目 } from './登记表.ts'
import type { 结果 } from './types.ts'
import { 成功, 失败 } from './types.ts'
import type { 蓝图 } from './commands/unit-add.ts'
import { 列出方法, 切方法, 删方法, 插方法, 改键, 有对象 } from './方法文件.ts'
import { 取上游输出, type 输出表 } from './方法类型.ts'

export const 当前变量名 = '方法'
export const 历史变量名 = '方法历史'
export const 分隔符 = '#'
export const 默认历史个数 = 10

/** 空的方法文件骨架 */
export function 空方法文件(蓝图名: string, 历史: boolean): string {
  const 变量 = 历史 ? 历史变量名 : 当前变量名
  const 键说明 = 历史 ? '键 = 单元名#时间戳（YYYYMMDD-HHMMSS）' : '键 = 单元名'
  return [
    `// ${蓝图名} · ${历史 ? '方法历史' : '方法'}`,
    '//',
    `// ${键说明}`,
    '// 由 dsh-blueprint-tree 维护：增删方法请走命令，别手改键',
    '',
    'type 上游输入 = { 来源: string; 数据: Record<string, unknown> }',
    '',
    `export const ${变量} = {`,
    '}',
    '',
  ].join('\n')
}

export interface 定位好 {
  项目目录: string
  配置: 项目配置
  蓝图名: string
  蓝图: 蓝图
  蓝图文件: string
  方法文件: string
  历史文件: string
}

/** 找项目 / 蓝图 / 两份方法文件的路径。参数：项目（项目名）、蓝图（可选，默认主蓝图） */
export function 定位(参数: Record<string, unknown>): 结果<定位好> {
  const 定 = 定位项目(参数)
  if (!定.ok) return 定
  const 项目目录 = 定.数据.项目目录

  const 配置 = 生效配置(String(第三层项目配置(项目目录).项目名 ?? ''), 项目目录)
  const 蓝图名 = String(参数.蓝图 ?? 配置.蓝图.默认名).trim().replace(/\.json$/i, '')
  if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')

  const 文件 = 产物文件名(配置, 蓝图名)
  const 蓝图文件 = path.join(项目目录, 文件.蓝图)
  if (!fs.existsSync(蓝图文件)) {
    return 失败('不存在', `蓝图不存在：${蓝图文件}`, 蓝图文件)
  }

  const 蓝图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
  if (!Array.isArray(蓝图.单元)) 蓝图.单元 = []

  return 成功({
    项目目录,
    配置,
    蓝图名,
    蓝图,
    蓝图文件,
    方法文件: path.join(项目目录, 文件.方法),
    历史文件: path.join(项目目录, 文件.方法历史),
  })
}

export function 读文本(p: string): string {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}

/**
 * 读方法文件。不存在 / 还是老格式（没有 `export const 方法 = {...}` 这层容器）
 * ⇒ 用空骨架重建（老模板只是个空壳，里面没有方法可丢）。
 */
export function 读方法文件(
  p: string,
  蓝图名: string,
  历史: boolean,
): { 源码: string; 重建: boolean } {
  const 变量 = 历史 ? 历史变量名 : 当前变量名
  const 文本 = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  if (文本.trim() && 有对象(文本, 变量)) return { 源码: 文本, 重建: false }
  return { 源码: 空方法文件(蓝图名, 历史), 重建: true }
}

/** YYYYMMDD-HHMMSS（本地时间，字典序 == 时间序） */
export function 时间戳(d = new Date()): string {
  const 补 = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${补(d.getMonth() + 1)}${补(d.getDate())}` +
    `-${补(d.getHours())}${补(d.getMinutes())}${补(d.getSeconds())}`
  )
}

/** 生成一个在历史文件里唯一的历史键（同一秒撞了就加 -2、-3） */
export function 唯一历史键(历史源码: string, 单元名: string): string {
  const 已有 = new Set(列出方法(历史源码, 历史变量名))
  const 基 = `${单元名}${分隔符}${时间戳()}`
  if (!已有.has(基)) return 基
  let i = 2
  while (已有.has(`${基}-${i}`)) i++
  return `${基}-${i}`
}

/**
 * 把一个方法从「当前」搬到「历史」：改键 → 切出来 → 插历史 → 从当前删掉。
 * 当前文件里没有这个方法就返回 undefined。
 */
export function 搬进历史(
  当前源码: string,
  历史源码: string,
  单元名: string,
  历史键: string,
): { 当前: string; 历史: string; 文本: string } | undefined {
  if (!切方法(当前源码, 单元名, 当前变量名)) return undefined

  // 先改键，再切 —— 这样插进历史时键已经是历史的了
  const 改了 = 改键(当前源码, 单元名, 历史键, 当前变量名)
  const 新块 = 切方法(改了.源码, 历史键, 当前变量名)
  if (!新块) return undefined

  const 历史 = 插方法(历史源码, 新块.文本, 历史变量名).源码
  const 当前 = 删方法(改了.源码, 历史键, 当前变量名).源码
  return { 当前, 历史, 文本: 新块.文本 }
}

/** 每个方法名（# 前）最多留几个历史，多的删最久（字典序最小） */
export function 裁历史(历史源码: string, 上限: number): { 源码: string; 删了: string[] } {
  let 源码 = 历史源码
  const 删了: string[] = []
  const 分组 = new Map<string, string[]>()

  for (const 键 of 列出方法(源码, 历史变量名)) {
    const 名 = 键.includes(分隔符) ? 键.slice(0, 键.indexOf(分隔符)) : 键
    if (!分组.has(名)) 分组.set(名, [])
    分组.get(名)!.push(键)
  }

  for (const 键们 of 分组.values()) {
    if (键们.length <= 上限) continue
    键们.sort()
    for (const 键 of 键们.slice(0, 键们.length - 上限)) {
      源码 = 删方法(源码, 键, 历史变量名).源码
      删了.push(键)
    }
  }
  return { 源码, 删了 }
}

/** 字段名能不能当标识符写进类型字面量 */
function 能当标识符(名: string): boolean {
  return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(名)
}

/**
 * 一个单元的方法骨架（不带前导缩进，中间行相对 +8、末行 +4）
 *
 * 用户 m14357：「用官方工具,检测最后return内的值的类型就能获取完整信息了」
 * ⇒ 上游字段类型由 `src/方法类型.ts` 用 TypeScript 类型检查器推出来，
 *   骨架里直接写成精确的 `as { 字段: 类型 }`，AI 不用去翻上游方法。
 */
export function 方法骨架(
  单元名: string,
  上层: string[],
  上游输出?: Record<string, 输出表 | undefined>,
  有广播?: boolean,
): string {
  const 键 = JSON.stringify(单元名)
  const 行: string[] = [
    // async：方法里可能要 await（问 AI、加载模块），状态机调用处本来就是 await
    `async ${键}(输入: 上游输入[]) {`,
  ]

  if (上层.length) {
    行.push('        //↓生成单元或上游变动时插件自动生成,能看不能改')
    const 用过 = new Set<string>()
    for (const 上 of 上层) {
      let 变量 = '上游_' + String(上).replace(/[^\p{L}\p{N}_$]/gu, '_')
      if (用过.has(变量)) {
        let i = 2
        while (用过.has(`${变量}_${i}`)) i++
        变量 = `${变量}_${i}`
      }
      用过.add(变量)
      const 取数 = `输入.find((i) => i.来源 === ${JSON.stringify(上)})?.数据`
      const 表 = 上游输出?.[上]
      const 字段们 = 表 ? Object.entries(表) : []
      if (字段们.length) {
        const 段 = 字段们.map(([名, 类型]) => `${能当标识符(名) ? 名 : JSON.stringify(名)}: ${类型}`)
        行.push(`        const ${变量} = ${取数} as {`)
        行.push(`            ${段.join('; ')};`)
        行.push('        } | undefined;')
      } else {
        行.push(`        const ${变量} = ${取数} as Record<string, unknown> | undefined;`)
      }
    }
  }

  if (有广播) {
    // 2026-11-24（首轮测评）：广播单元的输出去哪读 —— 状态机把它按只读快照
    // 塞进 `输入`，来源固定 `__广播`。蓝图里没人挂「广播」标签就不生成这行。
    行.push('        //↓广播区：标签为「广播」的单元发布的输出（只读快照，来源固定 __广播）')
    行.push(
      `        const 广播区 = 输入.find((i) => i.来源 === "__广播")?.数据 as Record<string, Record<string, unknown>> | undefined;`,
    )
  }

  行.push('        /*从这里开始***/')
  行.push('        return {};')
  行.push('    },')
  return 行.join('\n')
}

/**
 * 按方法文件现况生成骨架：上游字段类型从同文件的上游方法里推。
 * 文件读不到 / 上游没方法时退回 `Record<string, unknown>`。
 */
export function 骨架(蓝图: 蓝图, 单元名: string, 方法文件?: string): string {
  const 上层 = 上层们(蓝图, 单元名)
  let 源码 = ''
  if (方法文件) {
    try {
      源码 = fs.readFileSync(方法文件, 'utf8')
    } catch {
      源码 = ''
    }
  }
  const 上游输出 = 源码 ? 取上游输出(源码, 上层) : undefined
  const 有广播 = (蓝图.单元 ?? []).some((u) => u.标签 === '广播')
  return 方法骨架(单元名, 上层, 上游输出, 有广播)
}

/** 某单元的上层（从「下层」现算 —— 文件里不存上层） */
export function 上层们(蓝图: 蓝图, 单元名: string): string[] {
  const 出: string[] = []
  for (const u of 蓝图.单元 ?? []) {
    if ((u.下层 ?? []).includes(单元名)) 出.push(u.名)
  }
  return 出
}
