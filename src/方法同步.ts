// 方法同步 —— 上游方法一改，下游的「取数行」跟着重生成
//
// 用户 2026-11-20（原话）：
//   「不只是提醒,而是每次修改都会重新生成并且修改下游传参的那部分,
//     如果原文因此变了就改提示,注意下游可能有多个,
//     还有传参部分是不许AI和人修改的所以才设计了method.write,
//     每个单元都会根据上层由插件自动生成方法
//     (不通过method.write就是一个空的或者只有传参的方法),
//     而method.create就没必要了」
//
// ⇒ 分工：
//   · 骨架上半（`async "X"(输入: 上游输入[]) {` + 每个上游一行取数 + `/*从这里开始***/`）＝ 插件的地盘
//   · 标记之后的内容（正文、return）＝ AI / 人的地盘
//   · 上游一写，下游骨架的「上半」就重算一遍，正文原样保留
//   · 重算后文本真的变了，才把下游标成 `提醒`（报错/废弃/失效不覆盖）

import fs from 'node:fs'
import path from 'node:path'
import type { 蓝图 } from './commands/unit-add.ts'
import type { 项目配置 } from './项目.ts'
import { 方法骨架, 上层们, 当前变量名 } from './方法命令.ts'
import { 切方法, 插方法, 删方法 } from './方法文件.ts'
import { 取上游输出 } from './方法类型.ts'
import { 写蓝图状态 } from './状态写入.ts'
import { 产物文件名, 生效配置 } from './项目.ts'
import { 查项目 } from './登记表.ts'

export interface 同步位 {
  项目目录: string
  配置: 项目配置
  蓝图名: string
  蓝图: 蓝图
  方法文件: string
  历史文件: string
}

const 开始标记 = '/*从这里开始***'

/** 只比内容不比缩进：插方法会按位置重新缩进，行首空白不算「变了」 */
function 归一(文本: string): string {
  return 文本
    .split('\n')
    .map((l) => {
      const t = l.trim()
      return t.endsWith(',') ? t.slice(0, -1) : t
    })
    .join('\n')
    .trim()
}

/** 标记行在第几行（没有就 -1） */
function 标记行(行: string[]): number {
  return 行.findIndex((l) => l.includes(开始标记))
}

/**
 * 用新骨架的「上半」换掉旧方法的取数行，正文原样搬过去。
 * 旧方法不存在时直接返回骨架。
 */
export function 换传参(旧块: string | undefined, 骨架文本: string): string {
  const 骨 = 骨架文本.split('\n')
  const 骨标记 = 标记行(骨)
  if (骨标记 < 0) return 骨架文本
  const 头 = 骨.slice(0, 骨标记 + 1)
  if (!旧块) return 骨架文本

  const 旧 = 旧块.split('\n')
  const 旧标记 = 标记行(旧)
  const 体 = 旧标记 >= 0 ? 旧.slice(旧标记 + 1) : []
  if (!体.length) return 骨架文本

  return [...头, ...体].join('\n')
}

/** 单元是不是「有方法」的那种（子蓝图入口格没有方法） */
function 该有方法(u: 蓝图['单元'][number]): boolean {
  return u.类型 !== '子蓝图'
}

/**
 * 重生成一批单元的取数行。
 * @param 名单 要重算的单元（按蓝图里的顺序处理）
 * @returns 补了（原本没方法） / 改了（文本变了） / 提醒（状态被标成提醒）
 */
export function 重生成(位: 同步位, 名单?: string[]): { 补了: string[]; 改了: string[]; 提醒: string[] } {
  const 补了: string[] = []
  const 改了: string[] = []
  const 提醒: string[] = []

  let 源码 = ''
  try {
    源码 = fs.readFileSync(位.方法文件, 'utf8')
  } catch {
    源码 = ''
  }

  const 要哪些 = 名单 ? new Set(名单) : undefined
  const 状态表: Record<string, string> = {}
  const 有广播 = (位.蓝图.单元 ?? []).some((u) => u.标签 === '广播')

  for (const u of 位.蓝图.单元 ?? []) {
    if (!该有方法(u)) continue
    if (要哪些 && !要哪些.has(u.名)) continue

    const 上层 = 上层们(位.蓝图, u.名)
    const 上游输出 = 源码 ? 取上游输出(源码, 上层) : undefined
    const 骨 = 方法骨架(u.名, 上层, 上游输出, 有广播)
    const 块 = 切方法(源码, u.名, 当前变量名)
    const 新 = 换传参(块?.文本, 骨)

    if (!块) {
      const 插 = 插方法(源码, 新, 当前变量名)
      if (插.插了) {
        源码 = 插.源码
        补了.push(u.名)
        if (u.状态 === '正常') 状态表[u.名] = '提醒'
      }
      continue
    }

    if (归一(新) === 归一(块.文本)) continue

    const 删 = 删方法(源码, u.名, 当前变量名)
    const 插 = 插方法(删.源码, 新, 当前变量名)
    if (!插.插了) continue
    源码 = 插.源码
    改了.push(u.名)
    if (u.状态 === '正常' || u.状态 === '提醒') {
      u.状态 = '提醒'
      状态表[u.名] = '提醒'
    }
  }

  if (补了.length || 改了.length) {
    try {
      fs.writeFileSync(位.方法文件, 源码, 'utf8')
    } catch {
      /* 写不动就算了，别把方法写入搞挂 */
    }
  }

  if (Object.keys(状态表).length) {
    try {
      提醒.push(...写蓝图状态(位.项目目录, 位.配置, 位.蓝图名, 状态表))
    } catch {
      /* 状态写不动不影响方法 */
    }
  }

  return { 补了, 改了, 提醒 }
}

/** 直接下游（`下层` 里列出的单元，跳过 `$结束` / 结束单元 / 子蓝图入口） */
export function 下游们(蓝图: 蓝图, 单元名: string): string[] {
  const 本 = (蓝图.单元 ?? []).find((u) => u.名 === 单元名)
  const 指向 = (本?.下层 ?? []).filter((x) => String(x) !== '$结束')
  return (蓝图.单元 ?? [])
    .filter((u) => 指向.includes(u.名) && u.类型 !== '结束' && 该有方法(u))
    .map((u) => u.名)
}

/** 给整张蓝图补骨架 + 重算所有取数行（unit.add / 建项目 / 改连线后调用） */
export function 同步整蓝图(位: 同步位): { 补了: string[]; 改了: string[]; 提醒: string[] } {
  return 重生成(位)
}

/**
 * 给「项目名 + 蓝图名」做一次同步（链路命令跑完后兜底用）。
 * 读登记表拿目录、读 flow.json 拿配置、读蓝图 json 拿结构。
 */
export function 同步项目方法(项目名: string, 蓝图名?: string): { 补了: string[]; 改了: string[]; 提醒: string[] } {
  const 空 = { 补了: [] as string[], 改了: [] as string[], 提醒: [] as string[] }
  try {
    const 项 = 查项目(String(项目名))
    if (!项?.路径) return 空
    const 目录 = String(项.路径)
    const 配置 = 生效配置(String(项目名), 目录)
    const 名 = String(蓝图名 ?? 项.蓝图 ?? 配置.蓝图.默认名)
    const 文件 = 产物文件名(配置, 名)
    const 图 = JSON.parse(fs.readFileSync(path.join(目录, 文件.蓝图), 'utf8'))
    return 同步方法文件(目录, 配置, 名, 图)
  } catch {
    return 空
  }
}

/** 按蓝图名自己找两个方法文件 —— 给 unit.add / unit.update / 建项目 / 链路宿主用 */
export function 同步方法文件(
  项目目录: string,
  配置: 项目配置,
  蓝图名: string,
  蓝图: 蓝图,
): { 补了: string[]; 改了: string[]; 提醒: string[] } {
  const 文件 = 产物文件名(配置, 蓝图名)
  return 同步整蓝图({
    项目目录,
    配置,
    蓝图名,
    蓝图,
    方法文件: path.join(项目目录, 文件.方法),
    历史文件: path.join(项目目录, 文件.方法历史),
  })
}
