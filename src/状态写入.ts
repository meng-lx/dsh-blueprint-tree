// 状态写入 —— 把「单元 → 状态」一次性落盘
//
// 用户 2026-11-18 原话：
//   「运行和测试的检查项和修改项做了吗,主要是通过测试改正常,失败是报错,
//    运行时报错改失效」
//
// ⇒ 两条规矩：
//   ① 测试：跑通 ⇒ 正常，抛错 ⇒ 报错
//   ② 运行：抛错 ⇒ 失效；跑通 ⇒ 正常（运行前先把上次测试留下的「报错」落地成「失效」）
//
// 这里是唯一写盘口：读蓝图 json → 按表改「状态」→ 重算同步性 → 写回。
// 批量写是为了压测（一张图几十个单元，别一个单元读一次文件）。

import fs from 'node:fs'
import path from 'node:path'
import { 产物文件名 } from './项目.ts'
import { 算同步性 } from './蓝图工具.ts'
import { 活的单元 } from './路径.ts'
import type { 蓝图 } from './commands/unit-add.ts'

export type 项目配置 = Parameters<typeof 产物文件名>[0]

/** 一张蓝图要改的状态：`{ 单元名: '正常' | '提醒' | '报错' | '废弃' | '失效' | '断联' }` */
export type 状态表 = Record<string, string>

/**
 * 把一张蓝图的单元状态批量写盘。
 *
 * 返回实际改动的行（`蓝图·单元：状态`），没改动就返回空数组（也不碰文件）。
 */
export function 写蓝图状态(
  项目目录: string,
  配置: 项目配置,
  蓝图名: string,
  表: 状态表,
): string[] {
  const 文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).蓝图)
  if (!fs.existsSync(文件)) return []

  let 图: 蓝图
  try {
    图 = JSON.parse(fs.readFileSync(文件, 'utf8')) as 蓝图
  } catch {
    return []
  }

  const 改: string[] = []
  for (const u of 图.单元 ?? []) {
    const 新 = 表[u.名]
    if (!新 || u.状态 === 新) continue
    u.状态 = 新 as 蓝图['单元'][number]['状态']
    改.push(`${蓝图名}·${u.名}：${新}`)
  }
  if (!改.length) return []

  图.同步性 = 算同步性(图)
  fs.writeFileSync(文件, JSON.stringify(图, null, 2) + '\n', 'utf8')
  return 改
}

/**
 * 批量写多张蓝图（`{ 蓝图名: { 单元名: 状态 } }`）。
 *
 * 测试全项目会跨蓝图，所以要在这一层合并。
 */
export function 写状态(
  项目目录: string,
  配置: 项目配置,
  落: Record<string, 状态表>,
): string[] {
  const 改: string[] = []
  for (const [蓝图名, 表] of Object.entries(落)) {
    if (!表 || !Object.keys(表).length) continue
    改.push(...写蓝图状态(项目目录, 配置, 蓝图名, 表))
  }
  return 改
}

/**
 * 断联状态（用户 m15078）：
 *   「连不到开始或到不了结束的单元不用跑……这个功能就新增一个断联的状态,
 *    测试时不跑这种就行,页面把这个当失效展示」
 *
 * ⇒ 每次测试前算一遍「活的单元」：不在集合里的标 `断联`；
 *   之前是断联、这次又活了 ⇒ 改回 `正常`。
 *   已经是 报错/废弃/失效 的不动（那是别的语义，别覆盖）。
 */
export function 标断联(
  项目目录: string,
  配置: 项目配置,
  蓝图名: string,
  图: 蓝图,
): string[] {
  const 活的 = 活的单元(图)
  const 表: 状态表 = {}
  for (const u of 图.单元 ?? []) {
    const 在 = 活的.has(u.名)
    if (!在) {
      if (u.状态 === '正常' || u.状态 === '提醒' || u.状态 === '断联') 表[u.名] = '断联'
    } else if (u.状态 === '断联') {
      表[u.名] = '正常'
    }
  }
  if (!Object.keys(表).length) return []
  return 写蓝图状态(项目目录, 配置, 蓝图名, 表)
}
