// 报错 —— 拓扑检查留下的临时标记
//
// 用户 m19933 原话：
//   「修改后检查当前拓扑,连不上的单元就标报错,点运行,运行前把所有报错单元标失效,
//    为了效率,运行不负责检测而且由于报错标记是单独存储的,标失效也快」
//
// ⇒ 三条规矩：
//   ① 报错**不写进蓝图 json**（那是 `状态` 字段的事，写进去就要动文件、还要重算同步性）
//      单独存在项目根目录的 `报错.json` 里：{ 蓝图名: { 单元名: 消息 } }
//   ② 谁负责算：看图时算（`blueprint.graph` 每次都读这张图，顺手把 C5/C6 的结论落下）
//      页面刷新一次就等于「修改后检查一遍拓扑」
//   ③ 谁负责落地：`run` 开跑前把这里记的单元统一写成「失效」，清空这个文件；
//      运行本身不再做任何检测（用户：为了效率）

import fs from 'node:fs'
import path from 'node:path'
import { 查锚点 } from './校验.ts'
import type { 蓝图 } from './commands/unit-add.ts'

/** 项目根目录下的文件名 */
export const 报错文件名 = '报错.json'

/** `{ 蓝图名: { 单元名: 消息 } }` */
export type 报错表 = Record<string, Record<string, string>>

function 文件(项目目录: string): string {
  return path.join(项目目录, 报错文件名)
}

/** 读：读不出来/坏了都当空表，绝不让它挡住看图 */
export function 读报错(项目目录: string): 报错表 {
  try {
    const 原始: unknown = JSON.parse(fs.readFileSync(文件(项目目录), 'utf8'))
    if (!原始 || typeof 原始 !== 'object' || Array.isArray(原始)) return {}
    const 出: 报错表 = {}
    for (const [蓝图名, 表] of Object.entries(原始 as Record<string, unknown>)) {
      if (!表 || typeof 表 !== 'object' || Array.isArray(表)) continue
      const 单: Record<string, string> = {}
      for (const [单元名, 消息] of Object.entries(表 as Record<string, unknown>)) {
        if (typeof 消息 === 'string' && 消息) 单[单元名] = 消息
      }
      if (Object.keys(单).length) 出[蓝图名] = 单
    }
    return 出
  } catch {
    return {}
  }
}

/**
 * 用一张图的最新结论**替换**它那一段。
 *
 * 只动 `报错.json`，一个字节都不碰蓝图 json。
 * 返回变化行（给命令的 `改动` 用）。
 */
export function 写蓝图报错(项目目录: string, 蓝图名: string, 表: Record<string, string>): string[] {
  const 全部 = 读报错(项目目录)
  const 原 = 全部[蓝图名] ?? {}
  const 行: string[] = []

  for (const 名 of Object.keys(原)) {
    if (!(名 in 表)) 行.push(`${蓝图名}·${名}：报了错已清（又连上了）`)
  }
  for (const [名, 消息] of Object.entries(表)) {
    if (原[名] !== 消息) 行.push(`${蓝图名}·${名}：报错（${消息}）`)
  }

  if (Object.keys(表).length) 全部[蓝图名] = 表
  else delete 全部[蓝图名]

  try {
    if (Object.keys(全部).length) {
      fs.writeFileSync(文件(项目目录), JSON.stringify(全部, null, 2) + '\n', 'utf8')
    } else if (fs.existsSync(文件(项目目录))) {
      fs.unlinkSync(文件(项目目录))
    }
  } catch {
    // 报错是临时信息，写不进去也不能连累看图
  }
  return 行
}

/** 运行前落地完就删掉整份 */
export function 清全部报错(项目目录: string): void {
  try {
    if (fs.existsSync(文件(项目目录))) fs.unlinkSync(文件(项目目录))
  } catch {
    // 同上
  }
}

/**
 * 连不上的单元 —— 直接用校验的 C5/C6，不另写一套图算法。
 *
 * C5：从起点走不到；C6：走不到出口。
 * 废弃 / 失效 / 报错 的单元本来就算断路，不重复标。
 */
export function 算连不上(图: 蓝图, 是不是子蓝图: boolean): Record<string, string> {
  const 表: Record<string, string> = {}
  let 问题们
  try {
    问题们 = 查锚点(图, 是不是子蓝图)
  } catch {
    return 表
  }
  for (const p of 问题们) {
    if (p.码 !== 'C5' && p.码 !== 'C6') continue
    const 名 = p.位置
    if (!名) continue
    const u = (图.单元 ?? []).find((x) => x.名 === 名)
    if (!u) continue
    if (u.状态 === '废弃' || u.状态 === '失效' || u.状态 === '报错') continue
    if (!表[名]) 表[名] = p.消息
  }
  return 表
}
