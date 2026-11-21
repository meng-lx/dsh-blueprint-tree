// arrange —— 自动排列（用户 2026-11-16）
//
// 原话：
//   「我圈的这个地方放一个自动排列按钮,自动排列开始在其他单元上面,
//    结束在其他单元下面,其他单元根据普通向量的关系上下排列,尽量别让普通向量交叉」
//
// 做法（分层 + 交叉减少，就是 Sugiyama 那套的简化版）：
//   ① 分层：开始固定第 0 层；其他单元按普通向量（下层）取**最长路径**深度；
//      结束固定在最后一层；从开始走不到的单元，按它自己的最长链从第 1 层开始铺。
//   ② 层内排序：用重心法（barycenter）来回扫几轮，让上下两层的连线尽量不交叉。
//   ③ 落坐标：x = 60 + i*150，y = 50 + 层*110（跟客户端算布局的间距保持一致）。
//
// 「循环向量」是回边，不占格子、不写坐标（跟客户端的画法一致）。

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 生效配置, 第三层项目配置, 产物文件名 } from '../项目.ts'
import { 定位项目 } from '../登记表.ts'
import { 算同步性 } from '../蓝图工具.ts'
import { 规整单元 } from './unit-add.ts'
import type { 蓝图, 单元 } from './unit-add.ts'

const 格宽 = 150
const 格高 = 110
const 左留 = 60
const 上留 = 50

/** 普通向量出边：跳过 $结束、跳过不存在的、跳过「循环向量」（那是回边，不参与分层） */
function 普通出边(u: 单元, 表: Map<string, 单元>): string[] {
  return (u.下层 ?? []).filter((下) => {
    if (下 === '$结束') return false
    const v = 表.get(下)
    if (!v) return false
    if (v.类型 === '循环向量') return false
    return true
  })
}

/** 只走普通向量（不穿过循环向量），算每个单元到「能从起点走到的最深处」 */
function 算层(单元们: 单元[], 开始?: string): Map<string, number> {
  const 表 = new Map(单元们.map((u) => [u.名, u]))
  const 参与 = 单元们.filter((u) => u.类型 !== '循环向量')

  const 层 = new Map<string, number>()
  if (开始 && 表.has(开始)) 层.set(开始, 0)

  // 反复松弛求最长路径（图里可能有环，用轮数兜住，不会死循环）
  let 有变化 = true
  let 轮 = 0
  while (有变化 && 轮 <= 参与.length + 2) {
    有变化 = false
    轮++
    for (const u of 参与) {
      const 我 = 层.get(u.名)
      if (我 === undefined) continue
      for (const 下 of 普通出边(u, 表)) {
        const 目标 = 层.get(下)
        if (目标 === undefined || 目标 < 我 + 1) {
          层.set(下, 我 + 1)
          有变化 = true
        }
      }
    }
  }

  // 从开始走不到的：按它自己出发的最长链铺，从第 1 层开始（别越过开始）
  const 残余 = 参与.filter((u) => !层.has(u.名))
  for (const u of 残余) {
    if (层.has(u.名)) continue
    // 先在残余子图里跑一次最长路径
    const 局 = new Map<string, number>([[u.名, 0]])
    let 变 = true
    let 轮2 = 0
    while (变 && 轮2 <= 残余.length + 2) {
      变 = false
      轮2++
      for (const v of 残余) {
        const 我 = 局.get(v.名)
        if (我 === undefined) continue
        for (const 下 of 普通出边(v, 表)) {
          if (!残余.includes(表.get(下)!)) continue
          const 目标 = 局.get(下)
          if (目标 === undefined || 目标 < 我 + 1) {
            局.set(下, 我 + 1)
            变 = true
          }
        }
      }
    }
    for (const [名, d] of 局) if (!层.has(名)) 层.set(名, d + 1)
  }

  return 层
}

/**
 * 重心法排层内顺序：先按「上一层邻居的平均序号」排，再按「下一层邻居的平均序号」排，
 * 来回扫几轮。没有邻居的保持原位。
 */
function 排顺序(分层: string[][], 表: Map<string, 单元>): void {
  const 序号 = () => {
    const m = new Map<string, number>()
    分层.forEach((行) => 行.forEach((名, i) => m.set(名, i)))
    return m
  }

  for (let 轮 = 0; 轮 < 4; 轮++) {
    // 向下：看上一层
    for (let L = 1; L < 分层.length; L++) {
      const 上 = 序号()
      分层[L] = 分层[L]
        .map((名, i) => {
          const 前驱 = 表.get(名)?.下层 ?? []
          const 值 = 前驱
            .map((x) => 上.get(x))
            .filter((n) => n !== undefined) as number[]
          const 重心 = 值.length ? 值.reduce((a, b) => a + b, 0) / 值.length : i
          return { 名, 重心, i }
        })
        .sort((a, b) => (a.重心 === b.重心 ? a.i - b.i : a.重心 - b.重心))
        .map((x) => x.名)
    }
    // 向上：看下一层
    for (let L = 分层.length - 2; L >= 0; L--) {
      const 下 = 序号()
      const 被子 = new Map<string, string[]>()
      for (const [名, u] of 表) {
        for (const 子 of u.下层 ?? []) {
          if (!表.has(子)) continue
          const 组 = 被子.get(子) ?? []
          组.push(名)
          被子.set(子, 组)
        }
      }
      分层[L] = 分层[L]
        .map((名, i) => {
          const 后继 = (被子.get(名) ?? []).map((x) => 下.get(x)).filter((n) => n !== undefined) as number[]
          const 重心 = 后继.length ? 后继.reduce((a, b) => a + b, 0) / 后继.length : i
          return { 名, 重心, i }
        })
        .sort((a, b) => (a.重心 === b.重心 ? a.i - b.i : a.重心 - b.重心))
        .map((x) => x.名)
    }
  }
}

export const 自动排列: 命令定义 = {
  名: 'blueprint.arrange',
  说明: '自动排列蓝图里的单元：开始在最上、结束在最下，其余按普通向量分层，尽量少交叉',
  中文: ['自动排列', '排列', '整理蓝图', '自动布局'],
  执行(参数): 结果 {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const 项目目录 = 定.数据.项目目录

    const 配置 = 生效配置(String(第三层项目配置(项目目录).项目名 ?? ''), 项目目录)
    const 蓝图名 = String(参数.蓝图 ?? 配置.蓝图.默认名).trim().replace(/\.json$/i, '')
    if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')

    const 蓝图文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).蓝图)
    if (!fs.existsSync(蓝图文件)) {
      return 失败('不存在', `蓝图不存在：${蓝图文件}`, 蓝图文件)
    }

    const 蓝图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
    if (!Array.isArray(蓝图.单元) || !蓝图.单元.length) {
      return 成功({ 蓝图: 蓝图名, 排列: 0, 说明: '蓝图里没有单元' })
    }

    const 单元们 = 蓝图.单元
    const 表 = new Map(单元们.map((u) => [u.名, u]))
    const 开始 = 蓝图.开始 ?? 单元们.find((u) => u.类型 === '开始')?.名
    const 结束 = 蓝图.结束 ?? 单元们.find((u) => u.类型 === '结束')?.名

    const 层 = 算层(单元们, 开始)

    // 结束永远在最下面
    let 最大层 = 0
    for (const v of 层.values()) if (v > 最大层) 最大层 = v
    if (结束 && 表.has(结束)) {
      层.set(结束, 最大层 + 1)
      最大层 = 最大层 + 1
    }

    const 分层: string[][] = []
    for (let i = 0; i <= 最大层; i++) 分层.push([])
    for (const u of 单元们) {
      if (u.类型 === '循环向量') continue // 回边不占格子
      const L = 层.get(u.名) ?? 0
      ;(分层[L] ??= []).push(u.名)
    }

    排顺序(分层, 表)

    // 写坐标
    const 跳过: string[] = []
    const 结果坐标 = new Map<string, [number, number]>()
    for (let L = 0; L < 分层.length; L++) {
      for (let i = 0; i < 分层[L].length; i++) {
        结果坐标.set(分层[L][i], [左留 + i * 格宽, 上留 + L * 格高])
      }
    }
    for (const u of 单元们) {
      if (u.类型 === '循环向量') {
        跳过.push(u.名)
        continue
      }
      const p = 结果坐标.get(u.名)
      if (p) u.坐标 = p
    }

    蓝图.单元 = 单元们.map(规整单元)
    蓝图.同步性 = 算同步性(蓝图)
    // 坐标不是数据，别动同步性以外的东西
    fs.writeFileSync(蓝图文件, JSON.stringify(蓝图, null, 2) + '\n', 'utf8')

    return 成功({
      蓝图: 蓝图名,
      排列: 结果坐标.size,
      层数: 分层.length,
      ...(跳过.length ? { 没占格子的: 跳过 } : {}),
    })
  },
}
