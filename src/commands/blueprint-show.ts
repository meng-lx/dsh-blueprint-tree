// blueprint.show —— 看蓝图里的单元
//
// 用户 2026-11-10 定的规格：
//   「首先是输出没有换行符，这个是给 ai 和页面看的，在保证能让 ai 准确理解的情况下怎么省 token 怎么来」
//   「查看对应蓝图文件中单元的各个属性，可以 all 查看包含方法（如果有）的全部，
//     也可以选择查看某种或某几种属性，单元名和上下游是默认带的，因为没有这两个其他属性没意义」
//
// ⇒ 输出是 `行: string[]`，每项一行，**json 里没有 \n 转义**
// ⇒ 列默认只有 名/上层/下层；要别的就传 属性；`all` 连方法原文一起给

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 定位项目 } from '../登记表.ts'
import { 生效配置, 产物文件名 } from '../项目.ts'
import type { 单元, 蓝图 } from './unit-add.ts'
import { 读方法文件, 历史变量名, 分隔符, 当前变量名 } from '../方法命令.ts'
import { 切方法, 列出方法 } from '../方法文件.ts'
import { 算上层 } from '../蓝图工具.ts'

const 列名 = ['名', '类型', '标签', '状态', '坐标', '功能', '上层', '下层', '方法'] as const
type 列 = (typeof 列名)[number]

/** 用户：「单元名和上下游是默认带的」 */
const 默认列: 列[] = ['名', '上层', '下层']

/** 值里不能有 | 和换行（否则分列会错） */
function 净(s: string): string {
  return s.replace(/[|\r\n]+/g, ' ').trim()
}

function 要哪些列(参数: Record<string, unknown>): { 列: 列[]; 带方法原文: boolean } {
  const 原 = 参数.属性
  if (原 === undefined || 原 === null || String(原).trim() === '') {
    return { 列: 默认列, 带方法原文: false }
  }
  if (String(原).trim().toLowerCase() === 'all') {
    return { 列: [...列名], 带方法原文: true }
  }
  const 写成 = Array.isArray(原) ? 原.map(String) : String(原).split(/[,，\s]+/)
  const 集 = new Set<列>(默认列)
  for (const x of 写成) {
    const k = x.trim() as 列
    if (列名.includes(k)) 集.add(k)
  }
  return { 列: 列名.filter((c) => 集.has(c)), 带方法原文: 集.has('方法') }
}

function 取值(u: 单元, 列: 列, 方法数: number, 上层表: Record<string, string[]>): string {
  switch (列) {
    case '名':
      return 净(u.名)
    case '类型':
      return u.类型
    case '标签':
      return u.标签 ?? '无'
    case '状态':
      return u.状态 ?? '正常'
    case '坐标':
      return u.坐标 ? `${u.坐标[0]},${u.坐标[1]}` : '-'
    case '功能':
      return u.功能 ? 净(u.功能) : '-'
    case '上层': {
      const 上 = 上层表[u.名] ?? []
      return 上.length ? 上.map(净).join(',') : '-'
    }
    case '下层':
      return u.下层?.length ? u.下层.map(净).join(',') : '-'
    case '方法':
      return String(方法数)
  }
}

export const 看蓝图: 命令定义 = {
  名: 'blueprint.show',
  说明:
    '看蓝图里的单元。默认只有 名/上层/下层；属性=类型,标签(几种) 自己挑；属性=all 给全部+方法原文。输出是每行一项的数组',
  中文: ['查看蓝图', '看蓝图', '显示蓝图'],
  执行(参数): 结果 {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const { 项目名, 项目目录, 项 } = 定.数据

    const 配置 = 生效配置(项目名, 项目目录)
    const 蓝图名 = String(参数.蓝图 ?? 项.蓝图 ?? 配置.蓝图.默认名)
      .trim()
      .replace(/\.json$/i, '')
    if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')

    const 文件 = 产物文件名(配置, 蓝图名)
    const 蓝图文件 = path.join(项目目录, 文件.蓝图)
    if (!fs.existsSync(蓝图文件)) return 失败('不存在', `没有叫「${蓝图名}」的蓝图`, 蓝图名)

    let 蓝图: 蓝图
    try {
      蓝图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
    } catch {
      return 失败('校验', `蓝图文件不是合法 json：${蓝图名}`, 蓝图名)
    }
    if (!Array.isArray(蓝图.单元)) 蓝图.单元 = []

    // 方法：当前几个 + 各自历史几个
    let 当前源码 = ''
    let 历史源码 = ''
    try {
      当前源码 = 读方法文件(path.join(项目目录, 文件.方法), 蓝图名, false).源码
      历史源码 = 读方法文件(path.join(项目目录, 文件.方法历史), 蓝图名, true).源码
    } catch {
      // 方法层坏了不该拦住看蓝图
    }
    const 当前键 = new Set(列出方法(当前源码, 当前变量名))
    const 历史数: Record<string, number> = {}
    for (const 键 of 列出方法(历史源码, 历史变量名)) {
      const 名 = 键.includes(分隔符) ? 键.slice(0, 键.lastIndexOf(分隔符)) : 键
      历史数[名] = (历史数[名] ?? 0) + 1
    }
    const 方法计数 = (名: string): number => (当前键.has(名) ? 1 : 0) + (历史数[名] ?? 0)

    const { 列, 带方法原文 } = 要哪些列(参数)
    const 上层表 = 算上层(蓝图)
    const 行: string[] = [列.join('|')]
    for (const u of 蓝图.单元) {
      行.push(列.map((c) => 取值(u, c, 方法计数(u.名), 上层表)).join('|'))
    }

    // all（或显式要了「方法」）⇒ 把方法原文也附上，按名字排在表后面
    if (带方法原文) {
      for (const u of 蓝图.单元) {
        const 块 = 切方法(当前源码, u.名, 当前变量名)
        if (!块) continue
        行.push(`@${净(u.名)}`)
        行.push(...块.文本.split(/\r?\n/).map((s) => s.trimEnd()))
      }
    }

    return 成功({
      蓝图: 蓝图名,
      单元数: 蓝图.单元.length,
      开始: 蓝图.开始 ?? null,
      结束: 蓝图.结束 ?? null,
      列: 列.join(','),
      行,
    })
  },
}
