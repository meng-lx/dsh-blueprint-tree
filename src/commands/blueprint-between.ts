// blueprint.between —— 查两个单元之间的关系
//
// 用户 2026-11-10（原话）：
//   「现在继续子蓝图检验，做一个方法，要求是传入一项目一蓝图/子蓝图一此蓝图上游单元一此蓝图下游单元，
//    （仅在输入子蓝图时，两个单元都分别可为空，第一个为空则默认为此子蓝图开始概念单元，
//     第二个为空则默认为此蓝图结束概念单元），
//    返回两单元间关系（三种，支配/被支配/支配与被支配）和两单元之间（不包含两单元）是否含多上游软单元，
//    是否含多选择单元，包含的子蓝图名称，四种信息」
//
// ⚠️ 不枚举路径 —— 路径条数会指数爆炸（用户之前专门提过这个成本）。
//    「两单元之间」= 既能从甲走到、又能走到乙的单元集合（两次 DFS 就够，O(V+E)）。

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 定位项目 } from '../登记表.ts'
import { 生效配置, 产物文件名 } from '../项目.ts'
import type { 蓝图, 单元 } from './unit-add.ts'
import { 算上层, 结束标记, 是出口 } from '../蓝图工具.ts'

/** 两单元的关系 */
export type 关系 = '支配' | '被支配' | '支配与被支配' | '无关' | '没有通路'

/** 顺着「下层」走，能到达的所有单元（含起点；$结束 不是单元，跳过） */
function 到得了(图: 蓝图, 起点: string): Set<string> {
  const 表 = new Map((图.单元 ?? []).map((u) => [u.名, u]))
  const 到 = new Set<string>()
  const 队 = [起点]
  while (队.length) {
    const 名 = 队.pop()!
    if (到.has(名)) continue
    到.add(名)
    for (const 下 of 表.get(名)?.下层 ?? []) {
      if (下 === 结束标记 || 到.has(下) || !表.has(下)) continue
      队.push(下)
    }
  }
  return 到
}

/** 逆着「下层」走，能到达终点的所有单元（含终点） */
function 谁到得了(图: 蓝图, 终点: string): Set<string> {
  const 反图 = new Map<string, string[]>()
  for (const u of 图.单元 ?? []) {
    for (const 下 of u.下层 ?? []) {
      if (下 === 结束标记) continue
      ;(反图.get(下) ?? 反图.set(下, []).get(下)!).push(u.名)
    }
  }
  const 到 = new Set<string>()
  const 队 = [终点]
  while (队.length) {
    const 名 = 队.pop()!
    if (到.has(名)) continue
    到.add(名)
    for (const 上 of 反图.get(名) ?? []) {
      if (!到.has(上)) 队.push(上)
    }
  }
  return 到
}

/**
 * 把某个单元从图里拿掉，从入口出发还能不能到终点？
 *
 * 拿掉后到不了 ⇒ 被拿掉的那个**支配**终点（所有到终点的路都得经过它）。
 */
function 拿掉还能到吗(图: 蓝图, 拿掉: string, 入口: string, 终点: string): boolean {
  if (拿掉 === 入口) return false // 入口没了什么都到不了
  const 表 = new Map((图.单元 ?? []).map((u) => [u.名, u]))
  const 到 = new Set<string>()
  const 队 = [入口]
  while (队.length) {
    const 名 = 队.pop()!
    if (名 === 拿掉 || 到.has(名)) continue
    到.add(名)
    if (名 === 终点) return true
    for (const 下 of 表.get(名)?.下层 ?? []) {
      if (下 === 结束标记 || 下 === 拿掉 || !表.has(下)) continue
      队.push(下)
    }
  }
  return false
}

export const 查之间: 命令定义 = {
  名: 'blueprint.between',
  说明:
    '查两个单元之间的关系：支配/被支配/互为/无关；两单元之间有没有多上游软单元、选择单元、子蓝图。子蓝图时两个单元都可以留空（默认取入口/出口）',
  中文: ['查两单元', '两单元关系', '单元之间', '查关系', '两单元'],
  执行(参数): 结果 {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const { 项目名, 项目目录, 项 } = 定.数据

    const 配置 = 生效配置(项目名, 项目目录)
    const 蓝图名 = String(参数.蓝图 ?? 项.蓝图 ?? 配置.蓝图.默认名)
      .trim()
      .replace(/\.json$/i, '')
    if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')

    const 蓝图文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).蓝图)
    if (!fs.existsSync(蓝图文件)) {
      return 失败('不存在', `蓝图不存在：${蓝图文件}`, 蓝图文件)
    }

    let 图: 蓝图
    try {
      图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
    } catch {
      return 失败('校验', `蓝图文件不是合法 JSON：${path.basename(蓝图文件)}`, 蓝图名)
    }
    const 单元们 = 图.单元 ?? []
    const 名字集 = new Set(单元们.map((u) => u.名))

    // 是不是子蓝图：主蓝图有「开始」/「结束」类型的单元，子蓝图没有
    const 是子蓝图 = !单元们.some((u) => u.类型 === '开始' || u.类型 === '结束')

    // ① 收两个单元；子蓝图时允许留空（默认入口 / 出口）
    let 甲 = String(参数.上游单元 ?? 参数.甲 ?? '').trim()
    let 乙 = String(参数.下游单元 ?? 参数.乙 ?? '').trim()

    if (!甲) {
      if (!是子蓝图) return 失败('参数', '主蓝图必须给「上游单元」', '上游单元')
      if (!图.开始) return 失败('校验', '子蓝图没写入口（蓝图.开始），没法默认第一个单元', '上游单元')
      甲 = 图.开始
    }
    if (!乙) {
      if (!是子蓝图) return 失败('参数', '主蓝图必须给「下游单元」', '下游单元')
      const 出口们 = 单元们.filter(是出口).map((u) => u.名)
      if (!出口们.length) return 失败('校验', '子蓝图没有出口（没有单元的下层写 $结束），没法默认第二个单元', '下游单元')
      if (出口们.length > 1) {
        return 失败('校验', `子蓝图有 ${出口们.length} 个出口（${出口们.join('、')}），说不清默认哪个`, '下游单元')
      }
      乙 = 出口们[0]
    }

    if (!名字集.has(甲)) return 失败('不存在', `蓝图里没有单元「${甲}」`, 甲)
    if (!名字集.has(乙)) return 失败('不存在', `蓝图里没有单元「${乙}」`, 乙)
    if (甲 === 乙) return 失败('参数', '两个单元不能是同一个', '下游单元')

    // ② 通路：甲能不能走到乙
    const 甲到 = 到得了(图, 甲)
    const 能到乙 = 甲到.has(乙)

    // ③ 关系（不枚举路径：拿掉一个看另一个还到不到）
    const 入口 = 图.开始 && 名字集.has(图.开始) ? 图.开始 : 单元们[0]?.名
    let 关系值: 关系
    if (!能到乙) {
      关系值 = '没有通路'
    } else {
      const 甲支配乙 = 入口 ? !拿掉还能到吗(图, 甲, 入口, 乙) : false
      const 乙支配甲 = 入口 ? !拿掉还能到吗(图, 乙, 入口, 甲) : false
      关系值 =
        甲支配乙 && 乙支配甲 ? '支配与被支配' : 甲支配乙 ? '支配' : 乙支配甲 ? '被支配' : '无关'
    }

    // ④ 两单元之间（不含两端）= 甲能到 ∩ 能到乙
    const 能到乙集 = 谁到得了(图, 乙)
    const 中间 = [...甲到].filter((x) => 能到乙集.has(x) && x !== 甲 && x !== 乙).sort()

    const 表 = new Map(单元们.map((u) => [u.名, u]))
    const 上层表 = 算上层(图)
    const 中间单元 = 中间.map((名) => 表.get(名)!).filter(Boolean)

    const 多上游软单元 = 中间单元
      .filter((u: 单元) => u.类型 === '软' && (上层表[u.名] ?? []).length > 1)
      .map((u: 单元) => u.名)
    const 选择单元 = 中间单元.filter((u: 单元) => u.类型 === '选择').map((u: 单元) => u.名)
    const 子蓝图 = 中间单元.filter((u: 单元) => u.类型 === '子蓝图').map((u: 单元) => u.名)

    return 成功({
      蓝图: 蓝图名,
      开始单元: 甲,
      结束单元: 乙,
      关系: 关系值,
      有通路: 能到乙,
      之间: 中间,
      ...(多上游软单元.length ? { 多上游软单元 } : {}),
      ...(选择单元.length ? { 选择单元, 选择单元个数: 选择单元.length } : {}),
      ...(子蓝图.length ? { 子蓝图 } : {}),
      // 给校验用的两个布尔
      含多上游软单元: 多上游软单元.length > 0,
      含选择单元: 选择单元.length > 0,
    })
  },
}
