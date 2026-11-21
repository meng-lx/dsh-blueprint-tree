// 测试全项目 —— 从主蓝图的开始单元起跑整张图（真进子图）
//
// 用户 2026-11-15 原话：
//   「测试功能我准备分三种,全项目测试,当前蓝图测试,单个单元测试,
//    全项目测试无视失效状态,开始单元强制只启动一次(开始有可能进循环)」
//
// 和「测试蓝图」的区别只有三条：
//   ① 真进子图（不传「不进子图」）
//   ② 开始单元只启动一次（循环回到开始时不重录，防无限启动）
//   ③ 主蓝图固定是配置里的默认名

import fs from 'node:fs'
import path from 'node:path'
import type { 命令定义 } from '../commands.ts'
import { 成功, 失败 } from '../types.ts'
import { 生效配置, 第三层项目配置, 产物文件名 } from '../项目.ts'
import { 定位项目 } from '../登记表.ts'
import { 跑检查, 拦的消息 } from '../跑检查.ts'
import { 跑 } from '../状态机.ts'
import type { 上游输入 } from '../状态机.ts'
import { 详细行, 写日志 } from '../运行日志.ts'
import { 加载方法, 读方法源码 } from '../方法加载.ts'
import { 造读子图 } from '../蓝图文件.ts'
import { 写状态 } from '../状态写入.ts'
import type { 蓝图, 单元 } from './unit-add.ts'

export const 测试全项目: 命令定义 = {
  名: 'test.project',
  说明: '从主蓝图的开始单元起跑整张图（无视状态，开始只启动一次），可压测',
  中文: ['测试全项目', '全项目测试', '项目测试', '测项目'],
  执行(参数) {
    return 跑测试(参数)
  },
}

async function 跑测试(参数: Record<string, unknown>) {
  const 定 = 定位项目(参数)
  if (!定.ok) return 定
  const 项目目录 = 定.数据.项目目录
  const 配置 = 生效配置(String(第三层项目配置(项目目录).项目名 ?? ''), 项目目录)

  const 主蓝图名 = 配置.蓝图.默认名
  const 文件 = path.join(项目目录, 产物文件名(配置, 主蓝图名).蓝图)
  if (!fs.existsSync(文件)) return 失败('不存在', `主蓝图不存在：${主蓝图名}`, 主蓝图名)

  const 图 = JSON.parse(fs.readFileSync(文件, 'utf8')) as 蓝图

  // ④ 检查（检测分类.xlsx 里「测试方法」那一行：C1/C2 拦，C3-C6 改，C7/C8 拦）
  // 用户 2026-11-11：「执行时先检测标2的项有问题直接拦截并返回报错，没问题检测标1的项有问题在命令生效后直接改」
  const 检查 = 跑检查('test', {
    蓝图: 图,
    蓝图名: 主蓝图名,
    是不是子蓝图: false,
    限制: 配置.限制,
    方法源码: 读方法源码(项目目录, 配置, 主蓝图名),
    有子蓝图文件: (子名) => fs.existsSync(path.join(项目目录, 产物文件名(配置, 子名).蓝图)),
    读子图: 造读子图(项目目录, 配置),
  })
  if (检查.拦.length) {
    return 失败('校验', 拦的消息(检查.拦), 检查.拦[0].码)
  }

  const 入口 = 图.开始 ?? 图.单元.find((u) => u.类型 === '开始')?.名
  if (!入口) return 失败('校验', `主蓝图「${主蓝图名}」没有开始单元`, 主蓝图名)

  const 次数 = Math.max(1, Number(参数.次数 ?? 1) || 1)

  // 手给的上游（照「测试蓝图」的规矩：直接塞进共享数据）
  let 手给: 上游输入[] = []
  if (参数.上游 !== undefined) {
    const 原 = typeof 参数.上游 === 'string' ? JSON.parse(参数.上游) : 参数.上游
    if (!Array.isArray(原)) return 失败('参数', '「上游」要是一个数组', '上游')
    手给 = 原.map((x) => ({
      来源: String((x as Record<string, unknown>).来源 ?? ''),
      数据: ((x as Record<string, unknown>).数据 ?? {}) as Record<string, unknown>,
    }))
  }

  const 方法 = await 加载方法(项目目录, 配置, 主蓝图名)

  const 读蓝图 = (名: string) => {
    if (名 === 主蓝图名) return 图
    const p = path.join(项目目录, 产物文件名(配置, 名).蓝图)
    if (!fs.existsSync(p)) return undefined
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as 蓝图
    } catch {
      return undefined
    }
  }

  const 耗时们: number[] = []
  let 成功数 = 0
  let 失败数 = 0
  let 最后: Awaited<ReturnType<typeof 跑>> | undefined
  let 最后错误: unknown
  // 日志：测试要详细（用户 2026-11-16），只留最后一轮
  const 明细行: string[] = []
  // 用户 m13658：跑通 ⇒ 正常，抛错 ⇒ 报错（子图单元按图名分开记）
  const 状态落: Record<string, Record<string, string>> = {}

  for (let i = 0; i < 次数; i++) {
    const 共享数据: Record<string, Record<string, Record<string, unknown>>> = { [主蓝图名]: {} }
    for (const x of 手给) 共享数据[主蓝图名][x.来源] = x.数据

    const 开始 = Date.now()
    明细行.length = 0
    try {
      最后 = await 跑(图, {
        读蓝图,
        方法,
        共享数据,
        主蓝图名,
        无视状态: true,
        开始只一次: true,
        单元跑完: (图名, 单元名, 成功) => {
          ;(状态落[图名] ??= {})[单元名] = 成功 ? '正常' : '报错'
        },
        日志: (记录) => {
          明细行.push(详细行(记录))
        },
      })
      耗时们.push(Date.now() - 开始)
      if (最后.结局 === '完成' && 最后.结束信号) 成功数++
      else {
        失败数++
        // 用户 m14161：池空了不等于跑完了 —— 没收到结束信号就是没走到 $结束
        if (最后.结局 === '完成') 最后错误 = new Error('没走到结束单元（$结束）：池空了，但没有任何单元的下层指向出口')
      }
    } catch (e) {
      耗时们.push(Date.now() - 开始)
      失败数++
      最后错误 = e
    }
  }

  const 总 = 耗时们.reduce((a, b) => a + b, 0)
  // 用户 m13658：测试结果落到蓝图 json
  const 状态改动 = 写状态(项目目录, 配置, 状态落)
  const 数据: Record<string, unknown> = {
    蓝图: 主蓝图名,
    入口,
    次数,
    成功: 成功数,
    失败: 失败数,
    ...(状态改动.length ? { 状态改动 } : {}),
    耗时毫秒: {
      总,
      平均: 次数 ? Math.round(总 / 次数) : 0,
      最快: 耗时们.length ? Math.min(...耗时们) : 0,
      最慢: 耗时们.length ? Math.max(...耗时们) : 0,
    },
    ...(最后 ? { 结局: 最后.结局, 跑了: 最后.跑了 } : {}),
    ...(最后错误 ? { 错误: 最后错误 instanceof Error ? 最后错误.message : String(最后错误) } : {}),
  }
  const 日志文件 = 写日志(项目目录, '测试日志.log', 明细行)
  if (日志文件) 数据.日志 = path.basename(日志文件)

  if (成功数 === 0) return 失败('运行', `跑 ${次数} 次一次都没成功`, String(数据.结局 ?? '运行'))
  return 成功(数据)
}
