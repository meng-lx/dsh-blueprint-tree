// 方法加载 —— 把 `X.方法.ts` 变成「单元名 → 函数」
//
// 用户 2026-11-10：方法层一个蓝图一对文件（当前 + 历史），状态机只加载当前那个。
// 用带时间戳的 import 绕开 ESM 缓存，改完方法文件不用重启进程。

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { 产物文件名 } from './项目.ts'
import type { 单元方法 } from './状态机.ts'

export async function 加载方法(
  项目目录: string,
  配置: ReturnType<typeof import('./项目.ts').生效配置>,
  蓝图名: string,
): Promise<Record<string, 单元方法>> {
  const 文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).方法)
  if (!fs.existsSync(文件)) return {}
  try {
    const 带戳 = pathToFileURL(文件).href + '?t=' + Date.now()
    const 模块 = (await import(带戳)) as { 方法?: Record<string, 单元方法> }
    return 模块.方法 ?? {}
  } catch {
    // 方法文件坏了（语法错、import 失败）⇒ 当作没有方法
    return {}
  }
}

/** 方法文件的源码（G 组检查和随机数据都要它） */
export function 读方法源码(项目目录: string, 配置: ReturnType<typeof import('./项目.ts').生效配置>, 蓝图名: string): string {
  const 文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).方法)
  try {
    return fs.readFileSync(文件, 'utf8')
  } catch {
    return ''
  }
}
