// 测试共用
//
// 用户 2026-11-10 把命令接口从「路径」改成了「项目名」⇒ 命令返回里不再有路径，
// 测试要读文件就得先拿项目名反查目录，而反查走的是登记表。
//
// 登记表默认放在插件目录（会和真实使用的项目混在一起），测试里用 BLUEPRINT_TREE_HOME 指到临时目录。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 查项目 } from '../src/登记表.ts'

/** 每个测试文件一个独立的登记表目录，免得互相污染。返回那个目录。 */
export function 隔离登记表(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-home-'))
  process.env.BLUEPRINT_TREE_HOME = d
  return d
}

/** 造一个唯一的项目名（登记表是「同名覆盖」，测试里必须互不干扰） */
let 计数 = 0
export function 唯一名(基: string): string {
  计数 += 1
  return `${基}_${计数}`
}

/** 项目名 → 目录（测试里读文件用） */
export function 目录(项目名: string): string {
  const 项 = 查项目(项目名)
  if (!项) throw new Error(`测试里找不到项目：${项目名}`)
  return 项.路径
}

/** 项目名 → 某个产物的绝对路径 */
export function 文件(项目名: string, 名: string): string {
  return path.join(目录(项目名), 名)
}
