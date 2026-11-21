// ─────────────────────────────────────────────────────────────
// 编辑上下文
//
// 单元编辑弹窗要显示的东西（用户 2026-11-21）：
//   · 项目描述（主蓝图上的单元显示）
//   · 当前子蓝图对应的「子蓝图单元」的描述（子蓝图里的单元显示）
//   · 上游单元及其功能描述（子蓝图的入口单元要把父图那个子蓝图单元算作上游）
//
// 项目描述就放在项目文件夹里的 `项目描述.txt`，不另做命令，这里直接读写。
// ─────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { 产物文件名, type 项目配置 } from './项目.ts'
import { 读蓝图文件 } from './蓝图文件.ts'

/** 项目描述的文件名（放在项目文件夹根下） */
export const 项目描述文件名 = '项目描述.txt'

/** 上游单元 + 它的功能描述 */
export interface 上游描述 {
  名: string
  功能: string
  /** 本图 = 同一张蓝图里的上游；父图 = 子蓝图入口，上游是父图那个子蓝图单元 */
  来源: '本图' | '父图'
}

export interface 编辑上下文结果 {
  项目描述: string
  蓝图单元: string
  蓝图描述: string
  上游: 上游描述[]
}

export function 读项目描述(项目目录: string): string {
  try {
    const p = path.join(项目目录, 项目描述文件名)
    if (!fs.existsSync(p)) return ''
    return fs.readFileSync(p, 'utf8').trim()
  } catch {
    return ''
  }
}

export function 写项目描述(项目目录: string, 文本: string): void {
  fs.writeFileSync(path.join(项目目录, 项目描述文件名), String(文本 ?? ''), 'utf8')
}

/** 全项目扫一遍，找「名叫 图名 的子蓝图单元」属于哪张图（子蓝图单元名 = 蓝图名，全项目唯一） */
function 找父图(
  项目目录: string,
  配置: 项目配置,
  图名: string,
): { 父蓝图: string; 单元: Record<string, unknown> } | undefined {
  let 文件名们: string[] = []
  try {
    文件名们 = fs.readdirSync(项目目录).filter((f) => f.toLowerCase().endsWith('.json'))
  } catch {
    return undefined
  }
  for (const f of 文件名们) {
    let 图名们: string
    try {
      const 图 = JSON.parse(fs.readFileSync(path.join(项目目录, f), 'utf8')) as { 名?: unknown }
      图名们 = String(图?.名 ?? '')
    } catch {
      continue
    }
    if (!图名们 || 图名们 === 图名) continue
    const 图 = 读蓝图文件(项目目录, 配置, 图名们)
    if (!图) continue
    const 单元们 = Array.isArray(图.单元) ? (图.单元 as Record<string, unknown>[]) : []
    const 命中 = 单元们.find((u) => u && u.名 === 图名 && u.类型 === '子蓝图')
    if (命中) return { 父蓝图: 图名们, 单元: 命中 }
  }
  return undefined
}

/**
 * 算出编辑器要的上下文。
 * 找不到蓝图/单元时返回空壳，不抛错（界面拿不到就显示空）。
 */
export function 编辑上下文(
  项目目录: string,
  配置: 项目配置,
  蓝图名: string,
  单元名: string,
): 编辑上下文结果 {
  const 出: 编辑上下文结果 = {
    项目描述: 读项目描述(项目目录),
    蓝图单元: '',
    蓝图描述: '',
    上游: [],
  }
  const 图 = 读蓝图文件(项目目录, 配置, 蓝图名)
  if (!图) return 出
  const 单元们 = Array.isArray(图.单元) ? (图.单元 as unknown as Record<string, unknown>[]) : []
  const 主蓝图名 = String(配置.蓝图.默认名)

  // 上游：本图里 下层 写了 单元名 的那些
  for (const u of 单元们) {
    const 下层 = Array.isArray(u.下层) ? (u.下层 as unknown[]) : []
    if (下层.some((x) => String(x) === 单元名)) {
      出.上游.push({ 名: String(u.名 ?? ''), 功能: String(u.功能 ?? ''), 来源: '本图' })
    }
  }

  // 子蓝图：找到父图里那个「子蓝图单元」
  if (蓝图名 !== 主蓝图名) {
    const 父 = 找父图(项目目录, 配置, 蓝图名)
    if (父) {
      出.蓝图单元 = 父.父蓝图 ? String(父.单元.名 ?? '') : ''
      出.蓝图描述 = String(父.单元.功能 ?? '')
      // 入口单元的上游 = 父图那个子蓝图单元（用户 2026-11-21）
      if (出.蓝图单元 && String(单元名) === String(图.开始 ?? '')) {
        出.上游.unshift({ 名: 出.蓝图单元, 功能: 出.蓝图描述, 来源: '父图' })
      }
    }
  }

  return 出
}
