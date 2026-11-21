// blueprint.tree —— 结构树（同步性专用）
//
// 用户 2026-11-11（第 7 条，原话）：
//   「一个是检查蓝图递归一致性，就是目前的功能加个指定起点（必须，因为主蓝图不会被包含，
//     不会有被检查的需要），返回包含起点」
//   「这个方法是主要是为同步性服务的，所以返回包含的蓝图（递归）和其已经算好的同步性就行」
//   「层数不能限制，不然保证不了同步性」
//
// ⇒ 只做一件事：从起点往下递归，把「包含的蓝图 + 各自的同步性」列出来。
//   同步性直接读文件里已经算好的字段，不重算。
//   「上游/下游/描述」那套关系拆到 blueprint.detail（用户：「具体关系可以另外做一个」）。

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 定位项目 } from '../登记表.ts'
import { 生效配置, 产物文件名 } from '../项目.ts'
import type { 蓝图 } from './unit-add.ts'

function 净(s: string): string {
  return s.replace(/\|[ \r\n]+/g, ' ').trim()
}

function 读图(项目目录: string, 配置: ReturnType<typeof 生效配置>, 名: string): 蓝图 | undefined {
  const p = path.join(项目目录, 产物文件名(配置, 名).蓝图)
  if (!fs.existsSync(p)) return undefined
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as 蓝图
  } catch {
    return undefined
  }
}

export const 看结构: 命令定义 = {
  名: 'blueprint.tree',
  说明: '从指定蓝图往下递归，列出它包含的所有蓝图：名|同步性|状态|功能（状态/功能来自父图那个子蓝图单元）',
  中文: ['检查结构', '查结构', '结构一致性', '递归结构', '一致性'],
  执行(参数): 结果 {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const { 项目名, 项目目录 } = 定.数据

    const 配置 = 生效配置(项目名, 项目目录)

    // 起点必填 —— 主蓝图不会被别人包含，所以「从哪张图开始查」必须人说
    const 起点 = String(参数.蓝图 ?? '').trim().replace(/\.json$/i, '')
    if (!起点) return 失败('参数', '缺少「蓝图」——从哪张图开始查（起点必填）', '蓝图')
    if (!读图(项目目录, 配置, 起点)) {
      return 失败('不存在', `没有叫「${起点}」的蓝图`, 起点)
    }

    const 行: string[] = ['名|同步性|状态|功能']
    const 已看 = new Set<string>()

    // 2026-11-21（用户 m15655）：树不只是同步性——每一行就是父图里那个「子蓝图单元」，
    // 把它的状态和描述一起带上，AI 才能从总览看出哪条线已经废弃、哪张图是干什么的。
    // 起点没有父单元，状态/功能给 `-`。
    const 走 = (名: string, 层: number, 状态?: string, 功能?: string): void => {
      const 缩进 = '  '.repeat(层)
      if (已看.has(名)) {
        行.push(`${缩进}${净(名)}|(环)|${净(状态 ?? '-')}|${净(功能 ?? '')}`)
        return
      }
      已看.add(名)

      const 图 = 读图(项目目录, 配置, 名)
      let 同: string
      if (!图) 同 = '(缺文件)'
      else if (图.同步性 === 0 || 图.同步性 === 1) 同 = String(图.同步性)
      else 同 = '?' // 老文件没有这个字段

      行.push(`${缩进}${净(名)}|${同}|${净(状态 ?? '-')}|${净(功能 ?? '')}`)
      if (!图) return

      for (const u of 图.单元 ?? []) {
        if (u.类型 === '子蓝图') 走(u.名, 层 + 1, String(u.状态 ?? ''), String(u.功能 ?? ''))
      }
    }

    走(起点, 0)

    return 成功({ 起点, 蓝图数: 行.length - 1, 行 })
  },
}
