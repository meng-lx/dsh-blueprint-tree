// 项目登记表 —— 项目名 → 路径
//
// 用户 2026-11-10（原话）：「路径我想了想，还是不用绝对路径了，创建项目时把路径存在插件的
// 一个json文件里，命令只传项目名+指定蓝图名，根据项目名从这个文件取，
// 不然 ai 拿到具体位置可能会直接去改，这样就失控了」
//
// ⇒ 所以**命令的入参和返回值里都没有路径**。AI 只认识项目名，想动文件必须走控制器。
//
// 登记表放哪：插件目录下的 `项目登记.json`（和 package.json 同级）。
// 测试里用环境变量 BLUEPRINT_TREE_HOME 指到临时目录，免得互相污染。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { 结果 } from './types.ts'
import { 成功, 失败 } from './types.ts'

export const 登记表文件名 = '项目登记.json'

/** 插件根目录（src/ 的上一层） */
function 插件目录(): string {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)))
}

/** 登记表放哪：BLUEPRINT_TREE_HOME（测试用）→ 插件目录；旧名 FLOW3_HOME 仍认 */
export function 登记表目录(): string {
  const 环境 = String(process.env.BLUEPRINT_TREE_HOME ?? process.env.FLOW3_HOME ?? '').trim()
  return 环境 ? path.resolve(环境) : 插件目录()
}

export function 登记表路径(): string {
  return path.join(登记表目录(), 登记表文件名)
}

export interface 登记项 {
  /** 项目目录的绝对路径 —— 只存在这个文件里，不进命令参数、不进返回结果 */
  路径: string
  /** 默认蓝图名 */
  蓝图: string
  /** 建的时间（ISO） */
  创建于: string
}

export interface 登记表 {
  格式版本: number
  项目: Record<string, 登记项>
}

export function 读登记表(): 登记表 {
  const p = 登记表路径()
  if (!fs.existsSync(p)) return { 格式版本: 1, 项目: {} }
  try {
    const 表 = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<登记表>
    return { 格式版本: 1, 项目: (表.项目 ?? {}) as Record<string, 登记项> }
  } catch {
    return { 格式版本: 1, 项目: {} }
  }
}

export function 写登记表(表: 登记表): void {
  const p = 登记表路径()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify({ 格式版本: 1, 项目: 表.项目 }, null, 2) + '\n', 'utf8')
}

export function 查项目(名: string): 登记项 | undefined {
  return 读登记表().项目[名]
}

export function 项目名清单(): string[] {
  return Object.keys(读登记表().项目).sort()
}

/**
 * 登记一个项目。**同名直接覆盖** —— 用户 2026-11-10：「不用管重名的问题，后续交给检测功能」。
 * 后果是同名的旧项目会失联（路径被盖掉），这是已知的、有意的取舍。
 */
export function 登记(名: string, 项: 登记项): void {
  const 表 = 读登记表()
  表.项目[名] = 项
  写登记表(表)
}

/** 注销。返回本来有没有这个项目。 */
export function 注销(名: string): boolean {
  const 表 = 读登记表()
  if (!表.项目[名]) return false
  delete 表.项目[名]
  写登记表(表)
  return true
}

/**
 * 从参数里的「项目」名找出项目目录。
 *
 * 这是所有命令的唯一入口 —— 路径只在这里出现，命令入参/返回里都没有。
 */
export function 定位项目(
  参数: Record<string, unknown>,
): 结果<{ 项目名: string; 项目目录: string; 项: 登记项 }> {
  const 项目名 = String(参数.项目 ?? '').trim()
  if (!项目名) return 失败('参数', '缺少「项目」——项目叫什么名字', '项目')

  const 项 = 查项目(项目名)
  if (!项) {
    const 有 = 项目名清单()
    return 失败(
      '不存在',
      `没有叫「${项目名}」的项目。${有.length ? `现有：${有.join('、')}` : '还没有任何项目，先创建'}`,
      项目名,
    )
  }
  if (!fs.existsSync(项.路径)) {
    return 失败('不存在', `项目「${项目名}」登记的目录已经不在了，可能被手动删了`, 项目名)
  }
  return 成功({ 项目名, 项目目录: 项.路径, 项 })
}
