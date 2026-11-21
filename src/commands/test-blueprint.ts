// 测试蓝图 —— 跑一张蓝图（可以是子蓝图）
//
// 用户 2026-11-15 原话：
//   「蓝图测试因为可能涉及跨蓝图,所以也只能和单元测试一样,手动输入入口,
//    子蓝图单元输出或随机数,并且支持压测」
//
// 所以这张命令的三个特点：
//   ① **不进子图** —— 遇到「子蓝图」单元，不换成子图入口，而是给它一个假方法
//      （返回手给或随机的输出），这样测试不会跨蓝图
//   ② **无视状态** —— 报错/废弃/失效的单元照样跑
//   ③ 支持压测（跑 N 次，记耗时）

import fs from 'node:fs'
import path from 'node:path'
import type { 命令定义 } from '../commands.ts'
import { 成功, 失败 } from '../types.ts'
import { 生效配置, 第三层项目配置, 产物文件名 } from '../项目.ts'
import { 定位项目 } from '../登记表.ts'
import { 跑检查, 拦的消息 } from '../跑检查.ts'
import { 跑 } from '../状态机.ts'
import type { 单元方法, 上游输入 } from '../状态机.ts'
import { 详细行, 写日志 } from '../运行日志.ts'
import { 加载方法, 读方法源码 } from '../方法加载.ts'
import { 造读子图 } from '../蓝图文件.ts'
import { 写状态, 标断联 } from '../状态写入.ts'
import type { 蓝图, 单元 } from './unit-add.ts'

export const 测试蓝图: 命令定义 = {
  名: 'test.blueprint',
  说明: '跑一张蓝图（不进子图，无视状态），可压测',
  中文: ['测试蓝图', '蓝图测试', '测蓝图', '跑蓝图'],
  执行(参数) {
    return 跑测试(参数)
  },
}

async function 跑测试(参数: Record<string, unknown>) {
  const 定 = 定位项目(参数)
  if (!定.ok) return 定
  const 项目目录 = 定.数据.项目目录
  const 配置 = 生效配置(String(第三层项目配置(项目目录).项目名 ?? ''), 项目目录)

  const 蓝图名 = String(参数.蓝图 ?? 配置.蓝图.默认名).trim().replace(/\.json$/i, '')
  if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')

  const 文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).蓝图)
  if (!fs.existsSync(文件)) return 失败('不存在', `蓝图不存在：${蓝图名}`, 蓝图名)

  const 图 = JSON.parse(fs.readFileSync(文件, 'utf8')) as 蓝图

  // 检查（用户 2026-11-15：「把 检测分类.xlsx 里 run 与 test 两行的检查全部对齐」）
  // test 行：C1/C2/C7/C8 拦（2），C3-C6 改（1）
  const 检查 = 跑检查('test', {
    蓝图: 图,
    蓝图名,
    是不是子蓝图: 蓝图名 !== 配置.蓝图.默认名,
    限制: 配置.限制,
    方法源码: 读方法源码(项目目录, 配置, 蓝图名),
    有子蓝图文件: (子名) => fs.existsSync(path.join(项目目录, 产物文件名(配置, 子名).蓝图)),
    读子图: 造读子图(项目目录, 配置),
  })
  if (检查.拦.length) return 失败('校验', 拦的消息(检查.拦), 检查.拦[0].码)

  const 入口 = 图.开始 ?? 图.单元.find((u) => u.类型 === '开始')?.名
  if (!入口) return 失败('校验', `蓝图「${蓝图名}」没有开始单元`, 蓝图名)

  const 次数 = Math.max(1, Number(参数.次数 ?? 1) || 1)
  const 用随机 = 参数.随机 === true || 参数.随机 === 'true'

  // 手给的上游（用户：「手动输入入口」）⇒ 直接塞进共享数据
  // 形状：[{ 来源: '甲', 数据: {...} }]
  let 手给: 上游输入[] = []
  if (参数.上游 !== undefined) {
    const 原 = typeof 参数.上游 === 'string' ? JSON.parse(参数.上游) : 参数.上游
    if (!Array.isArray(原)) return 失败('参数', '「上游」要是一个数组', '上游')
    手给 = 原.map((x) => ({
      来源: String((x as Record<string, unknown>).来源 ?? ''),
      数据: ((x as Record<string, unknown>).数据 ?? {}) as Record<string, unknown>,
    }))
  }

  const 方法 = await 加载方法(项目目录, 配置, 蓝图名)

  // 子蓝图单元给假方法（用户：「子蓝图单元输出或随机数」）
  // ⚠️ 这里造不出「下游真会读的字段」—— 子图是黑盒，外面只知道它会吐东西。
  //    所以给一个通用形状：{ 值: 随机数 }。
  const 假方法: Record<string, 单元方法> = {}
  for (const u of 图.单元) {
    if (u.类型 !== '子蓝图') continue
    if (方法[u.名]) continue // 真有方法就不盖
    假方法[u.名] = () => ({ 值: Math.random() })
  }

  const 全部方法: Record<string, 单元方法> = { ...假方法, ...方法 }

  // 用户 m15078：测试前先标一批「断联」（连不到开始 / 到不了结束），测试里不跑它们
  const 断联改 = 标断联(项目目录, 配置, 蓝图名, 图)

  const 耗时们: number[] = []
  let 成功数 = 0
  let 失败数 = 0
  let 最后: Awaited<ReturnType<typeof 跑>> | undefined
  let 最后错误: unknown
  // 日志：测试要详细（用户 2026-11-16），但只留最后一轮，压测 100 轮别爆
  const 明细行: string[] = []
  // 用户 m13658：跑通 ⇒ 正常，抛错 ⇒ 报错（压测多轮时以最后一轮为准）
  const 状态落: Record<string, Record<string, string>> = {}

  for (let i = 0; i < 次数; i++) {
    // 每次重新造一份共享数据（用户：「压测随机值最好每次都新生成」）
    const 共享数据: Record<string, Record<string, Record<string, unknown>>> = { [蓝图名]: {} }
    for (const x of 手给) 共享数据[蓝图名][x.来源] = x.数据

    const 开始 = Date.now()
    明细行.length = 0
    try {
      最后 = await 跑(图, {
        读蓝图: (名) => {
          if (名 === 蓝图名) return 图
          const p = path.join(项目目录, 产物文件名(配置, 名).蓝图)
          if (!fs.existsSync(p)) return undefined
          try {
            return JSON.parse(fs.readFileSync(p, 'utf8')) as 蓝图
          } catch {
            return undefined
          }
        },
        方法: 全部方法,
        共享数据,
        主蓝图名: 蓝图名,
        无视状态: true,
        不进子图: true,
        // 用户 m15078：蓝图测试 —— 哪张图走到 $结束 都就地结束，不回溯父图
        测试: '蓝图',
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
  // 用户 m13658：测试结果落到蓝图 json（跑过的单元：通 ⇒ 正常，错 ⇒ 报错）
  const 状态改动 = [...断联改, ...写状态(项目目录, 配置, 状态落)]
  const 数据: Record<string, unknown> = {
    蓝图: 蓝图名,
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
    ...(用随机 ? { 随机: true } : {}),
    ...(手给.length ? { 手给上游: 手给.map((x) => x.来源) } : {}),
    ...(最后 ? { 结局: 最后.结局, 跑了: 最后.跑了 } : {}),
    ...(假方法 && Object.keys(假方法).length ? { 假输出: Object.keys(假方法) } : {}),
    ...(最后错误 ? { 错误: 最后错误 instanceof Error ? 最后错误.message : String(最后错误) } : {}),
  }
  // 详细日志：只留最后一轮（压测看的是典型一轮，不是一百份重复）
  const 日志文件 = 写日志(项目目录, '测试日志.log', 明细行)
  if (日志文件) 数据.日志 = path.basename(日志文件)

  if (成功数 === 0) return 失败('运行', `跑 ${次数} 次一次都没成功`, String(数据.错误 ?? '运行'))
  return 成功(数据)
}
