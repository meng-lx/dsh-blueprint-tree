// 跑检查 —— 一个命令该跑哪些检查、结果怎么分
//
// 用户 2026-11-11（原话）：
//   「执行时先检测标 2 的项有问题直接拦截并返回报错，没问题检测标 1 的项有问题在命令生效后直接改，0 不管」
//
// ⇒ 这里是唯一入口：命令把上下文交进来，它返回两组：
//     拦 = 标 2 的、有问题的（命令必须停，一个字节都不写）
//     改 = 标 1 的、有问题的（命令先生效，再按这里说的改）
//
// ⚠️ 「改」只告诉「哪里不对、该怎么改」，**不在这里动手** —— 动手是命令自己的事
//    （比如 B2 要建循环向量单元、C5 要把连不到的单元标报错，都得命令自己来）。

import type { 蓝图 } from './commands/unit-add.ts'
import type { 限制配置 } from './项目.ts'
import type { 问题 } from './校验.ts'
import {
  查单元,
  查连线,
  查锚点,
  查子蓝图文件,
  查方法,
  查规模,
  查硬单元,
  查循环,
} from './校验.ts'
import type { 命令名, 检查码 } from './检查表.ts'
import { 查级别 } from './检查表.ts'

export interface 检查上下文 {
  蓝图: 蓝图
  蓝图名: string
  /** 这张图是不是子蓝图 */
  是不是子蓝图: boolean
  /** 方法文件全文（G 组要） */
  方法源码?: string
  历史源码?: string
  /** 规模限制（H 组要） */
  限制: 限制配置
  /** 某个子蓝图的 .json 存不存在（F1 要） */
  有子蓝图文件?: (名: string) => boolean
  /** 读子图（D2 / E2 要） */
  读子图?: (名: string) => 蓝图 | undefined
}

export interface 检查结果 {
  /** 标 2 且没过 —— 命令必须停 */
  拦: 问题[]
  /** 标 1 且没过 —— 命令生效后再处理 */
  改: 问题[]
}

/** 全部 31 个码，按顺序跑（顺序只影响同一轮里谁先报） */
const 全码: 检查码[] = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
  'B0', 'B1', 'B2', 'B3',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8',
  'D1', 'D2', 'D3', 'E0', 'E1', 'E2', 'E3',
  'F1',
  'G1', 'G2', 'G3',
  'H1', 'H2',
]

/** 单独跑一个码，返回它的全部问题 */
function 跑一个码(码: 检查码, 上下: 检查上下文): 问题[] {
  switch (码) {
    case 'A1':
    case 'A2':
    case 'A3':
    case 'A4':
    case 'A5':
    case 'A6':
      return 查单元(上下.蓝图).filter((p) => p.码 === 码)

    case 'B0':
    case 'B1':
    case 'B2':
    case 'B3':
      return 查连线(上下.蓝图).filter((p) => p.码 === 码)

    case 'C1':
    case 'C2':
    case 'C3':
    case 'C4':
    case 'C5':
    case 'C6':
    case 'C7':
    case 'C8':
      return 查锚点(上下.蓝图, 上下.是不是子蓝图).filter((p) => p.码 === 码)

    case 'D1':
    case 'D2':
    case 'D3':
      return 查硬单元(上下.蓝图, 上下.读子图).filter((p) => p.码 === 码)

    case 'E0':
    case 'E1':
    case 'E2':
    case 'E3':
      return 查循环(上下.蓝图, 上下.读子图).filter((p) => p.码 === 码)

    case 'F1':
      return 上下.有子蓝图文件 ? 查子蓝图文件(上下.蓝图, 上下.有子蓝图文件) : []

    case 'G1':
    case 'G2':
    case 'G3':
      if (上下.方法源码 === undefined) return []
      return 查方法(上下.蓝图, 上下.方法源码, 上下.历史源码).filter((p) => p.码 === 码)

    case 'H1':
    case 'H2':
      return 查规模(上下.蓝图, 上下.限制).filter((p) => p.码 === 码)
  }
}

/**
 * 跑一个命令该跑的检查。
 *
 * 只跑表里非 0 的码；结果按 2 / 1 分成「拦」「改」两组。
 */
export function 跑检查(命令: 命令名, 上下: 检查上下文): 检查结果 {
  const 拦: 问题[] = []
  const 改: 问题[] = []

  for (const 码 of 全码) {
    const 级别 = 查级别(命令, 码)
    if (级别 === 0) continue
    const 问题们 = 跑一个码(码, 上下)
    if (!问题们.length) continue
    if (级别 === 2) 拦.push(...问题们)
    else 改.push(...问题们)
  }

  return { 拦, 改 }
}

/** 把「拦」的这组问题拼成一句人话（给返回的 错误.消息） */
export function 拦的消息(问题们: 问题[]): string {
  if (!问题们.length) return ''
  const 头 = 问题们.slice(0, 3).map((p) => `${p.码} ${p.消息}`)
  const 多 = 问题们.length > 3 ? `（还有 ${问题们.length - 3} 条）` : ''
  return 头.join('；') + 多
}

/** 「改」的这组折成行文本，放进返回的 改动 字段 */
export function 改的行(问题们: 问题[]): string[] {
  return 问题们.map((p) => [p.码, p.消息, p.位置 ?? ''].join('|').replace(/\|+$/, ''))
}
