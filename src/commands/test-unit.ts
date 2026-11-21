// test.unit —— 单个单元测试（三种测试里最小的一种）
//
// 用户 2026-11-15：
//   「测试功能我准备分三种,全项目测试,当前蓝图测试,单个单元测试」
//   「单元测试可以手动输入上游参数,或者随机数测试,两种都可压测看性能」
//   「1,单个单元压测时并发单元会并发测试,否则串行」
//   「这些数据是要输入共享数据让状态机调用注入给单元的」
//
// 用户 m15078（改造）：不再直调方法 ——「把单元直接塞待做池里,然后加个"单元测试"标签,
// 让状态机跑,状态机遇到"单元测试"标签运行结束直接返回$结束」。
// ⇒ 引擎的 `测试: '单元'` 模式：种子项跑完就结束；随机上游垫进共享数据，
//   由状态机按正常路径组「输入」交给方法（跟运行完全同一条路）。
//
// 随机模式：按上游方法 `return { 字段: 变量 }` + `const 变量: 类型` 造
// （用户：「根据上游的字段类型随机,上游没方法就先不提供随机的」）。

import fs from 'node:fs'
import path from 'node:path'
import type { 命令定义 } from '../commands.ts'
import { 成功, 失败 } from '../types.ts'
import { 生效配置, 产物文件名, 第三层项目配置 } from '../项目.ts'
import { 定位项目 } from '../登记表.ts'
import type { 蓝图 } from './unit-add.ts'
import type { 上游输入 } from '../状态机.ts'
import { 跑 } from '../状态机.ts'
import { 加载方法 } from '../方法加载.ts'
import { 算上层 } from '../蓝图工具.ts'
import { 取字段表, 造输出 } from '../随机数据.ts'
import { 写状态, 标断联 } from '../状态写入.ts'

export const 测试单元: 命令定义 = {
  名: 'test.unit',
  说明: '单独跑一个单元的方法（可给上游参数，也可随机造；支持压测看耗时）',
  中文: ['测试单元', '单元测试'],
  执行(参数) {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const 项目目录 = 定.数据.项目目录

    const 配置 = 生效配置(String(第三层项目配置(项目目录).项目名 ?? ''), 项目目录)
    const 蓝图名 = String(参数.蓝图 ?? 配置.蓝图.默认名).trim().replace(/\.json$/i, '')
    const 单元名 = String(参数.单元 ?? '').trim()
    if (!单元名) return 失败('参数', '缺少「单元」——测哪个单元', '单元')

    const 蓝图文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).蓝图)
    if (!fs.existsSync(蓝图文件)) {
      return 失败('不存在', `蓝图不存在：${蓝图名}`, 蓝图名)
    }
    const 图 = JSON.parse(fs.readFileSync(蓝图文件, 'utf8')) as 蓝图
    const 本单元 = (图.单元 ?? []).find((u) => u.名 === 单元名)
    if (!本单元) return 失败('不存在', `蓝图「${蓝图名}」里没有单元「${单元名}」`, 单元名)

    // 次数（压测）
    const 次数 = 参数.次数 === undefined ? 1 : Number(参数.次数)
    if (!Number.isInteger(次数) || 次数 < 1) {
      return 失败('参数', '「次数」要正整数', '次数')
    }

    const 随机 = 参数.随机 === true || 参数.随机 === 'true'
    const 手给 = 参数.上游

    // 并行还是串行（用户：「单个单元压测时并发单元会并发测试,否则串行」）
    const 并发 = 本单元.标签 === '并发'

    return 跑测试(项目目录, 配置, 蓝图名, 图, 本单元.名, { 次数, 随机, 手给, 并发 })
  },
}

async function 跑测试(
  项目目录: string,
  配置: ReturnType<typeof 生效配置>,
  蓝图名: string,
  图: 蓝图,
  单元名: string,
  选项: { 次数: number; 随机: boolean; 手给: unknown; 并发: boolean },
): Promise<ReturnType<typeof 成功> | ReturnType<typeof 失败>> {
  // 方法（引擎要用整张图的方法表）
  const 方法 = await 加载方法(项目目录, 配置, 蓝图名)
  if (!方法[单元名]) {
    return 失败('不存在', `单元「${单元名}」没有方法，没法测`, 单元名)
  }

  // 上游名单
  const 上层 = 算上层(图)[单元名] ?? []

  // 方法源码（随机模式要按上游的返回类型造）
  const 方法文件 = path.join(项目目录, 产物文件名(配置, 蓝图名).方法)
  const 源码 = fs.existsSync(方法文件) ? fs.readFileSync(方法文件, 'utf8') : ''

  // 造一份上游数据：`{ 来源: 数据 }`（引擎会按 上层 顺序组输入）
  const 造上游 = (): { 表: Record<string, Record<string, unknown>>; 缺方法: string[] } => {
    if (选项.手给 !== undefined) {
      const 手 = 解析上游(选项.手给)
      if (手 === undefined) return { 表: {}, 缺方法: ['<参数格式不对>'] }
      const 表: Record<string, Record<string, unknown>> = {}
      for (const x of 手) 表[x.来源] = x.数据
      return { 表, 缺方法: [] }
    }
    if (!选项.随机) return { 表: {}, 缺方法: [] }

    const 表: Record<string, Record<string, unknown>> = {}
    const 缺: string[] = []
    for (const 来源 of 上层) {
      const 字段 = 取字段表(源码, 来源)
      if (字段 === undefined) {
        缺.push(来源) // 上游没方法 ⇒ 不提供随机（用户定的）
        continue
      }
      表[来源] = 造输出(字段) as Record<string, unknown>
    }
    return { 表, 缺方法: 缺 }
  }

  const 读蓝图 = (名: string): 蓝图 | undefined => {
    const 文件 = path.join(项目目录, 产物文件名(配置, 名).蓝图)
    if (!fs.existsSync(文件)) return undefined
    try {
      return JSON.parse(fs.readFileSync(文件, 'utf8')) as 蓝图
    } catch {
      return undefined
    }
  }

  // 跑一次：引擎按「单元测试」模式跑，种子就是这一个单元
  const 跑一次 = async (): Promise<{ 用时: number; 错误?: string }> => {
    const 种子 = 造上游().表
    const 起 = process.hrtime.bigint()
    let 错: string | undefined
    try {
      const 结果 = await 跑(图, {
        读蓝图,
        蓝图名们: () => [蓝图名],
        方法,
        共享数据: { [蓝图名]: Object.fromEntries(Object.entries(种子).map(([k, v]) => [k, { 数据: v, 成功: true }])) },
        主蓝图名: 蓝图名,
        点火: {},
        测试: '单元',
        起始: { 蓝图: 蓝图名, 单元: 单元名 },
        最多步数: 10,
        最多并发: 32,
        该停: () => false,
      })
      if (结果.结局 !== '完成' || !结果.结束信号) {
        错 = 结果.结局 === '失败' ? String(结果.错误 ?? '运行失败') : `没跑完（${结果.结局}）`
      }
    } catch (e) {
      错 = e instanceof Error ? e.message : String(e)
    }
    return { 用时: Number(process.hrtime.bigint() - 起) / 1e6, 错误: 错 }
  }

  // 用户 m15078：测试前先标「断联」（连不到开始 / 到不了结束），测试里不跑它们
  const 断联改 = 标断联(项目目录, 配置, 蓝图名, 图)

  // 压测
  const 批次 = 选项.并发
    ? await Promise.all(Array.from({ length: 选项.次数 }, 跑一次))
    : await (async () => {
        const 出 = []
        for (let i = 0; i < 选项.次数; i++) 出.push(await 跑一次())
        return 出
      })()

  const 成功次 = 批次.filter((x) => x.错误 === undefined)
  const 失败次 = 批次.filter((x) => x.错误 !== undefined)
  const 用时们 = 批次.map((x) => x.用时).sort((a, b) => a - b)

  // 用户 m13658：测试跑通 ⇒ 正常，抛错 ⇒ 报错
  const 状态改动 = [...断联改, ...写状态(项目目录, 配置, {
    [蓝图名]: { [单元名]: 失败次.length ? '报错' : '正常' },
  })]

  const 数据: Record<string, unknown> = {
    蓝图: 蓝图名,
    单元: 单元名,
    并发: 选项.并发,
    次数: 选项.次数,
    成功: 成功次.length,
    失败: 失败次.length,
    ...(状态改动.length ? { 状态改动 } : {}),
    ...(用时们.length
      ? {
          耗时毫秒: {
            总: 四舍五入(用时们.reduce((a, b) => a + b, 0)),
            平均: 四舍五入(用时们.reduce((a, b) => a + b, 0) / 用时们.length),
            最快: 四舍五入(用时们[0]),
            最慢: 四舍五入(用时们[用时们.length - 1]),
          },
        }
      : {}),
    // 随机模式下，哪些上游因为没有方法而没给随机值
    ...(选项.随机 && 选项.手给 === undefined
      ? { 没方法的上下游: 造上游().缺方法 }
      : {}),
    ...(失败次.length
      ? { 错误: 失败次.slice(0, 3).map((x) => x.错误) }
      : {}),
  }

  if (失败次.length && 成功次.length === 0) {
    return 失败('运行', String(失败次[0].错误), 单元名)
  }
  return 成功(数据)
}

/** 解析手给的上游：JSON 字符串 / 数组 / 单个对象都收 */
function 解析上游(值: unknown): 上游输入[] | undefined {
  let o: unknown = 值
  if (typeof 值 === 'string') {
    try {
      o = JSON.parse(值)
    } catch {
      return undefined
    }
  }
  const 列表 = Array.isArray(o) ? o : [o]
  const 出: 上游输入[] = []
  for (const 项 of 列表) {
    if (!项 || typeof 项 !== 'object') return undefined
    const r = 项 as Record<string, unknown>
    if (typeof r.来源 !== 'string') return undefined
    出.push({
      来源: r.来源,
      数据: (r.数据 ?? {}) as Record<string, unknown>,
    })
  }
  return 出
}

function 四舍五入(n: number): number {
  return Math.round(n * 1000) / 1000
}
