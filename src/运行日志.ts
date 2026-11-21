import fs from 'node:fs'
import path from 'node:path'
import type { 日志记录 } from './状态机.ts'

/**
 * 状态机日志的两种排版（用户 2026-11-16：
 * 「测试是详细日志，运行是简化的，留个可以关日志的方式」）。
 *
 * 状态机只给结构化的一条 日志记录，这里决定它长什么样：
 *  - 简化：每格一行，够看清「谁跑了、多久、往哪走」
 *  - 详细：把输入与输出整段摊开，排查用
 */

function 时刻(): string {
  return new Date().toISOString().slice(11, 23)
}

function 位置(记录: 日志记录): string {
  return 记录.单元 ? `${记录.蓝图}·${记录.单元}` : 记录.蓝图
}

/** 运行用的简化行 */
export function 简化行(记录: 日志记录): string {
  const 头 = `${时刻()} ${位置(记录)}`
  switch (记录.类型) {
    case '跑完':
      return `${头} ${记录.耗时 ?? 0}ms → ${记录.下游?.length ? 记录.下游.join('、') : '（没有下游）'}`
    case '跳过':
      return `${头} 跳过（状态是 报错/废弃/失效）`
    case '失败':
      return `${头} 失败：${记录.错误 ?? '（没有错误消息）'}`
    case '中止':
      return `${时刻()} 中止（被要求结束 / 到步数上限）`
    case '完成':
      return `${时刻()} 完成`
    case '卡死':
      return `${时刻()} 卡死（还有 ${记录.剩下 ?? 0} 个单元在等，但没有能跑的）${记录.错误 ? `：${记录.错误}` : ''}`
    default:
      return `${头} ${记录.类型}`
  }
}

/** 测试用的详细行：输入/输出整段展开 */
export function 详细行(记录: 日志记录): string {
  const 行: string[] = [简化行(记录)]
  if (记录.输入 && 记录.输入.length) {
    for (const 一条 of 记录.输入) {
      let 文本 = ''
      try {
        文本 = JSON.stringify(一条.数据)
      } catch {
        文本 = '（输出无法序列化）'
      }
      行.push(`      上游 ${一条.来源} = ${文本}`)
    }
  }
  if (记录.输出 !== undefined) {
    let 文本 = ''
    try {
      文本 = JSON.stringify(记录.输出)
    } catch {
      文本 = '（输出无法序列化）'
    }
    行.push(`      输出 = ${文本}`)
  }
  return 行.join('\n')
}

/**
 * 写日志文件（项目目录下）。不传 文件名 就不写，只返回行。
 * 每次运行/测试覆盖上一份 —— 看的是「这一轮发生了什么」。
 */
export function 写日志(项目目录: string, 文件名: string | undefined, 行: string[]): string | undefined {
  if (!文件名 || !行.length) return undefined
  const 文件 = path.join(项目目录, 文件名)
  fs.writeFileSync(文件, 行.join('\n') + '\n', 'utf8')
  return 文件
}
