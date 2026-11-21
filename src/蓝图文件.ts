// 从磁盘读蓝图 json —— 检测、同步性计算、查看结构共用

import fs from 'node:fs'
import path from 'node:path'
import type { 蓝图 } from './commands/unit-add.ts'
import type { 项目配置 } from './项目.ts'
import { 产物文件名 } from './项目.ts'

/** 读一张图；不存在或坏了都返回 undefined */
export function 读蓝图文件(项目目录: string, 配置: 项目配置, 名: string): 蓝图 | undefined {
  const p = path.join(项目目录, 产物文件名(配置, 名).蓝图)
  if (!fs.existsSync(p)) return undefined
  try {
    const 图 = JSON.parse(fs.readFileSync(p, 'utf8')) as 蓝图
    // 老文件里叫「冻结」，2026-11-21 起统一叫「废弃」（冻结=回收站，人可手改）
    for (const u of 图.单元 ?? []) {
      if ((u as { 状态?: string }).状态 === '冻结') (u as { 状态?: string }).状态 = '废弃'
    }
    return 图
  } catch {
    return undefined
  }
}

/**
 * 造一个「按名字读子图」的函数，给 `算同步性` 递归用。
 *
 * 只在当前项目目录里找，不跨项目。
 */
export function 造读子图(
  项目目录: string,
  配置: 项目配置,
): (名: string) => 蓝图 | undefined {
  return (名: string) => 读蓝图文件(项目目录, 配置, 名)
}
