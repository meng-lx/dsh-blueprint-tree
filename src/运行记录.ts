// 运行记录 —— 上一次跑的是「运行」还是「测试」，以及测试标出来的报错
//
// 用户 2026-11-15 定的运行方法三步（原话）：
//   「先看之前运行方法和测试方法哪个最后执行,是测试方法就把测试方法标报错的全标失效
//    再启动开始单元,否则直接启动开始单元」
//
// ⇒ 但测试方法是**不落盘**的（用户 m03542 第②条：「报错不落盘,临时存储」），
//   它标出来的报错只在返回里，下次运行方法读不到 ⇒ 所以要在这里落一份。
//
// 文件放在**项目目录**下，跟蓝图 json 平级：
//   { "上次": "测试" | "运行", "测试报错": [{ 蓝图, 单元, 码, 消息 }] }

import fs from 'node:fs'
import path from 'node:path'

/** 一条测试报错：哪张图的哪个单元、因为哪个检查码 */
export interface 测试报错 {
  蓝图: string
  单元: string
  码: string
  消息: string
}

export interface 运行记录 {
  /** 上一次跑的是哪个 */
  上次: '运行' | '测试'
  /** 上次测试标出来的报错（只在「上次」是测试时有意义） */
  测试报错: 测试报错[]
  /**
   * 有没有人要求「结束」（用户 2026-11-15：「我建议做一个结束命令，供测试和
   * AI 或用户用」）。
   *
   * 跨进程只能靠文件：`结束` 命令把它写 true，状态机每轮读一次，
   * 读到就清池子、清共享数据、返回「中止」。
   */
  要求结束?: boolean
}

/** 记录文件名 */
export const 运行记录文件名 = '运行记录.json'

/** 空记录 —— 从来没跑过的时候用 */
export function 空运行记录(): 运行记录 {
  return { 上次: '运行', 测试报错: [] }
}

/** 读运行记录；文件不在或坏了都当没有 */
export function 读运行记录(项目目录: string): 运行记录 {
  const 文件 = path.join(项目目录, 运行记录文件名)
  try {
    if (!fs.existsSync(文件)) return 空运行记录()
    const 原始 = JSON.parse(fs.readFileSync(文件, 'utf8')) as Partial<运行记录>
    const 上次 = 原始.上次 === '测试' ? '测试' : '运行'
    const 报错 = Array.isArray(原始.测试报错)
      ? 原始.测试报错
          .filter((x): x is 测试报错 => !!x && typeof x === 'object')
          .map((x) => ({
            蓝图: String(x.蓝图 ?? ''),
            单元: String(x.单元 ?? ''),
            码: String(x.码 ?? ''),
            消息: String(x.消息 ?? ''),
          }))
      : []
    return { 上次, 测试报错: 报错, ...(原始.要求结束 === true ? { 要求结束: true } : {}) }
  } catch {
    return 空运行记录()
  }
}

/** 写运行记录 */
export function 写运行记录(项目目录: string, 记录: 运行记录): void {
  const 文件 = path.join(项目目录, 运行记录文件名)
  fs.writeFileSync(文件, JSON.stringify(记录, null, 2) + '\n', 'utf8')
}
