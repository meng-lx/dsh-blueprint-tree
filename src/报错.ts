// 报错 —— 拓扑检查留下的临时标记
//
// 用户 m19933 原话：
//   「修改后检查当前拓扑,连不上的单元就标报错,点运行,运行前把所有报错单元标失效,
//    为了效率,运行不负责检测而且由于报错标记是单独存储的,标失效也快」
//
// 用户 m20352 验收后又补了两条：
//   ① 「把检查结果绑到拓扑写入成功后的版本；运行只消费同版本结果，不必重新遍历」
//      —— 旧标记会误伤已经接回去的单元；从没看过图的断路单元又落不下去。
//   ② 「整图无出口时，C6 只给图级错误，而标记收集会跳过没有单元位置的错误」
//      —— 图级结论也要单独存下来，让看图能显示「没有出口」。
//
// ⇒ 所以 `报错.json` 的形状是：
//   { 蓝图名: { 版本: 拓扑指纹, 单元: { 单元名: 消息 }, 图级: [消息] } }
//
// 三条规矩不变：
//   ① 报错**不写进蓝图 json**（那是 `状态` 字段的事，写进去就要动文件、还要重算同步性）
//   ② 谁负责算：拓扑写入成功后算一次（单元增删改、看图），结论带上当时的拓扑指纹
//   ③ 谁负责落地：`run` 开跑前只消费**指纹对得上**的结论，把它记的单元写成「失效」

import fs from 'node:fs'
import path from 'node:path'
import { 查锚点 } from './校验.ts'
import type { 蓝图 } from './commands/unit-add.ts'

/** 项目根目录下的文件名 */
export const 报错文件名 = '报错.json'

/** 一张图的检查结论 */
export type 报错段 = {
  /** 算这份结论时这张图的拓扑指纹 */
  版本: string
  /** 连不上的单元 → 消息 */
  单元: Record<string, string>
  /** 图级结论（没法归到某个单元上的，比如「整张图没有任何出口」） */
  图级: string[]
}

/** `{ 蓝图名: 报错段 }` */
export type 报错表 = Record<string, 报错段>

function 文件(项目目录: string): string {
  return path.join(项目目录, 报错文件名)
}

/**
 * 拓扑指纹 —— 只看「决定连通性」的字段。
 *
 * 状态 / 坐标 / 功能 / 描述都不算：改它们不该让拓扑结论过期
 * （尤其是 `run` 自己会写状态，写一次就把标记全作废，等于没用）。
 */
export function 图指纹(图: 蓝图): string {
  const 单元 = [...(图.单元 ?? [])]
    .map((u) => [u.名, u.类型, u.标签 ?? '', [...(u.下层 ?? [])]] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return JSON.stringify({ 开始: 图.开始 ?? '', 结束: 图.结束 ?? '', 单元 })
}

/** 读：读不出来/坏了都当空表，绝不让它挡住看图 */
export function 读报错(项目目录: string): 报错表 {
  try {
    const 原始: unknown = JSON.parse(fs.readFileSync(文件(项目目录), 'utf8'))
    if (!原始 || typeof 原始 !== 'object' || Array.isArray(原始)) return {}
    const 出: 报错表 = {}
    for (const [蓝图名, 段] of Object.entries(原始 as Record<string, unknown>)) {
      if (!段 || typeof 段 !== 'object' || Array.isArray(段)) continue
      const 对象 = 段 as Record<string, unknown>
      // 新形状：{ 版本, 单元, 图级 }
      if ('单元' in 对象 || '图级' in 对象) {
        const 单: Record<string, string> = {}
        const 原单 = 对象.单元
        if (原单 && typeof 原单 === 'object' && !Array.isArray(原单)) {
          for (const [名, 消息] of Object.entries(原单 as Record<string, unknown>)) {
            if (typeof 消息 === 'string' && 消息) 单[名] = 消息
          }
        }
        const 级 = Array.isArray(对象.图级)
          ? 对象.图级.filter((x): x is string => typeof x === 'string' && !!x)
          : []
        if (!Object.keys(单).length && !级.length) continue
        出[蓝图名] = { 版本: typeof 对象.版本 === 'string' ? 对象.版本 : '', 单元: 单, 图级: 级 }
        continue
      }
      // 旧形状：{ 单元名: 消息 } —— 没有版本，一律当过期（运行时只按它清标记，不落地）
      const 单: Record<string, string> = {}
      for (const [名, 消息] of Object.entries(对象)) {
        if (typeof 消息 === 'string' && 消息) 单[名] = 消息
      }
      if (Object.keys(单).length) 出[蓝图名] = { 版本: '', 单元: 单, 图级: [] }
    }
    return 出
  } catch {
    return {}
  }
}

function 写全表(项目目录: string, 全部: 报错表): void {
  try {
    if (Object.keys(全部).length) {
      fs.writeFileSync(文件(项目目录), JSON.stringify(全部, null, 2) + '\n', 'utf8')
    } else if (fs.existsSync(文件(项目目录))) {
      fs.unlinkSync(文件(项目目录))
    }
  } catch {
    // 报错是临时信息，写不进去也不能连累看图
  }
}

/**
 * 用一张图的最新结论**替换**它那一段。
 *
 * 只动 `报错.json`，一个字节都不碰蓝图 json。
 * 返回变化行（给命令的 `改动` 用）。
 */
export function 写蓝图报错(
  项目目录: string,
  蓝图名: string,
  结论: { 单元: Record<string, string>; 图级: string[] },
  版本: string,
): string[] {
  const 全部 = 读报错(项目目录)
  const 原 = 全部[蓝图名]
  const 行: string[] = []

  for (const 名 of Object.keys(原?.单元 ?? {})) {
    if (!(名 in 结论.单元)) 行.push(`${蓝图名}·${名}：报了错已清（又连上了）`)
  }
  for (const [名, 消息] of Object.entries(结论.单元)) {
    if (原?.单元?.[名] !== 消息) 行.push(`${蓝图名}·${名}：报错（${消息}）`)
  }
  const 原级 = new Set(原?.图级 ?? [])
  for (const 消息 of 结论.图级) {
    if (!原级.has(消息)) 行.push(`${蓝图名}：${消息}`)
  }
  for (const 消息 of 原级) {
    if (!结论.图级.includes(消息)) 行.push(`${蓝图名}：图级报错已清（${消息}）`)
  }

  if (Object.keys(结论.单元).length || 结论.图级.length) {
    全部[蓝图名] = { 版本, 单元: 结论.单元, 图级: [...结论.图级] }
  } else {
    delete 全部[蓝图名]
  }
  写全表(项目目录, 全部)
  return 行
}

/** 算一遍再写下去 —— 拓扑写入成功后调这个（用户 m20352） */
export function 刷新蓝图报错(项目目录: string, 蓝图名: string, 图: 蓝图, 是不是子蓝图: boolean): string[] {
  try {
    return 写蓝图报错(项目目录, 蓝图名, 算连不上(图, 是不是子蓝图), 图指纹(图))
  } catch {
    return []
  }
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
 * 没有 `位置` 的错误（例如「整张图没有任何出口」）收进 `图级`，不能丢。
 */
export function 算连不上(图: 蓝图, 是不是子蓝图: boolean): { 单元: Record<string, string>; 图级: string[] } {
  const 单元表: Record<string, string> = {}
  const 图级: string[] = []
  let 问题们
  try {
    问题们 = 查锚点(图, 是不是子蓝图)
  } catch {
    return { 单元: 单元表, 图级 }
  }
  for (const p of 问题们) {
    if (p.码 !== 'C5' && p.码 !== 'C6') continue
    const 名 = p.位置
    if (!名) {
      if (!图级.includes(p.消息)) 图级.push(p.消息)
      continue
    }
    const u = (图.单元 ?? []).find((x) => x.名 === 名)
    if (!u) continue
    if (u.状态 === '废弃' || u.状态 === '失效' || u.状态 === '报错') continue
    if (!单元表[名]) 单元表[名] = p.消息
  }
  return { 单元: 单元表, 图级 }
}
