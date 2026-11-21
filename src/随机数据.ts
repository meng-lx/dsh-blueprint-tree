// 随机数据 —— 按方法里的类型标注造反
//
// 用户 2026-11-15：
//   「压测随机值最好每次都新生成,根据上游的字段类型随机,上游没方法就先不提供随机的」
// 用户 m04881：
//   「方法检测强制要求 const 名字: string = ... 这种写法」
//
// ⇒ 类型只有一个来源：`const 变量: 类型 = ...` 那行（G4 会盯着它）。
//   拿不到类型的字段就给一个随机字符串 —— 总比没有强，但调用方应当知道它是猜的。

import { 切方法 } from './方法文件.ts'

export type 字段类型 = 'string' | 'number' | 'boolean' | 'unknown'

/** 一个单元的返回：字段名 → 类型 */
export type 字段表 = Record<string, 字段类型>

/**
 * 从方法文件里取某个单元的「返回字段 → 类型」。
 *
 * @param 源码 方法文件全文
 * @param 键   方法键（= 单元名）
 */
export function 取字段表(源码: string, 键: string): 字段表 | undefined {
  const 块 = 切方法(源码, 键, '方法')
  if (!块) return undefined
  const 表: 字段表 = {}

  // return { 字段: 变量, ... } —— 必须是方法最后一行（D2）
  // ⚠️ 不能用 `\}\s*$`：切出来的文本末尾还有方法自己的闭合 `}`。
  //    取最后一个 return，再匹配到它后面第一个 `}`（return 的对象里不会有嵌套）。
  const 位置 = 块.文本.lastIndexOf('return')
  if (位置 < 0) return 表
  const 返回 = 块.文本.slice(位置).match(/return\s*\{([^}]*)\}/)
  if (!返回) return 表

  for (const 段 of 返回[1].split(',')) {
    // 两种写法都收：`return { 字段: 变量 }` 和简写 `return { 变量 }`
    const m = 段.match(
      /^\s*([A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*)\s*(?::\s*([A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*))?\s*$/,
    )
    if (!m) continue
    const 字段 = m[1]
    const 变量 = m[2] ?? m[1]
    表[字段] = 归一(取类型标注(块.文本, 变量))
  }

  return 表
}

/** `const 变量: 类型 = ...` 里的类型；没有标注就 undefined */
function 取类型标注(文本: string, 变量: string): string | undefined {
  const m = 文本.match(
    new RegExp(`(?:const|let|var)\\s+${转义(变量)}\\s*:\\s*([A-Za-z_$][\\w$<>[\\]|, ]*)`),
  )
  return m?.[1]?.trim()
}

/** 把 TS 类型收成三种能造的类型 */
function 归一(t: string | undefined): 字段类型 {
  if (!t) return 'unknown'
  const 干净 = t.replace(/\s+/g, '')
  if (干净 === 'string') return 'string'
  if (干净 === 'number') return 'number'
  if (干净 === 'boolean') return 'boolean'
  return 'unknown'
}

/** 按类型造一个值（每次都新生成，用户 2026-11-15） */
export function 造值(类型: 字段类型): unknown {
  switch (类型) {
    case 'string':
      return Math.random().toString(36).slice(2, 10)
    case 'number':
      return Math.floor(Math.random() * 1000)
    case 'boolean':
      return Math.random() < 0.5
    default:
      // 类型没写 / 认不出来 —— 给个短随机串（G4 会提醒作者去补）
      return Math.random().toString(36).slice(2, 10)
  }
}

/** 按字段表造一整个输出对象 */
export function 造输出(表: 字段表): Record<string, unknown> {
  const 出: Record<string, unknown> = {}
  for (const [字段, 类型] of Object.entries(表)) 出[字段] = 造值(类型)
  return 出
}

/** 正则里转义一个变量名 */
function 转义(s: string): string {
  return s.replace(/[$]/g, '\\$')
}
