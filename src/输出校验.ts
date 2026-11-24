/**
 * 输出门禁（2026-11-25 开发交接第 1 节）
 *
 * 规则：一个单元的普通输出必须是**平坦的普通记录**，字段值只允许
 * `string` / `boolean` / 有限 `number`；`undefined` 视为「省略字段」；
 * 其它一切（`null`、数组、嵌套对象、`Map`/`Set`/`Date`、函数、`symbol`、
 * `bigint`、`NaN`、`±Infinity`）一律拒绝，**不落盘、不激发下游**。
 *
 * 理由：引擎不替用户递归拷贝复杂类型（跨边、广播、子图出口、日志、Worker
 * 回传都要求「可序列化且不可变」）。要传结构就由方法作者自己编码成字符串
 * （例如 `JSON.stringify([...map])`），接收方按同一约定还原。
 *
 * 例外：点火包（`{ 项目, 命令, 参数, 项目目录, 配置, 宿主 }`）是**内部通道**，
 * 里面带着宿主能力（函数）与嵌套参数，不是普通方法输出；它靠 `__内部` 标记
 * 一路往数据里传，凡是输入里带着这个标记的单元都按内部通道处理，不进门禁。
 */

/** 允许出现在普通输出里的字段值类型 */
export type 输出原始值 = string | boolean | number

/** 门禁结果 */
export type 输出检查 =
  | { ok: true; 干净: Record<string, 输出原始值> }
  | { ok: false; 字段: string; 实际: string; 提示: string }

/** 给人看的类型名（错误信息里用，别用 `typeof` 的英文） */
export function 描述类型(值: unknown): string {
  if (值 === null) return 'null'
  if (值 === undefined) return 'undefined'
  if (Array.isArray(值)) return '数组'
  if (typeof 值 === 'number') {
    if (Number.isNaN(值)) return 'NaN'
    if (!Number.isFinite(值)) return 值 > 0 ? 'Infinity' : '-Infinity'
    return 'number'
  }
  const 类名 = typeof 值 === 'object' ? (值 as object).constructor?.name : ''
  if (类名 === 'Map') return 'Map'
  if (类名 === 'Set') return 'Set'
  if (类名 === 'Date') return 'Date'
  if (类名 === 'Promise') return 'Promise'
  if (typeof 值 === 'object') return '对象'
  if (typeof 值 === 'function') return '函数'
  return typeof 值
}

const 提示文本 =
  '只允许 string / boolean / 有限 number；要传结构请自己编码成字符串（例如 JSON.stringify([...map])），接收方再按约定还原'

/**
 * 检查一个输出。成功时返回**引擎自持的新记录**（不保留原对象的引用），
 * 失败时给出第一个不合法字段。
 */
export function 检查输出(输出: unknown): 输出检查 {
  if (输出 === undefined || 输出 === null) {
    // 无方法 / 空返回：归一化成空记录
    return { ok: true, 干净: {} }
  }
  if (typeof 输出 !== 'object' || Array.isArray(输出)) {
    return { ok: false, 字段: '(整个输出)', 实际: 描述类型(输出), 提示: '输出必须是 `return { 字段: 值 }` 这样的普通对象' }
  }
  const 原型 = Object.getPrototypeOf(输出)
  if (原型 !== Object.prototype && 原型 !== null) {
    return { ok: false, 字段: '(整个输出)', 实际: 描述类型(输出), 提示: '输出必须是普通对象，不能是 Map / Set / 类的实例' }
  }
  const 符号键 = Object.getOwnPropertySymbols(输出)
  if (符号键.length > 0) {
    return { ok: false, 字段: String(符号键[0]), 实际: 'symbol 键', 提示: '输出字段名只能是字符串键' }
  }
  const 干净: Record<string, 输出原始值> = {}
  for (const 键 of Object.keys(输出 as Record<string, unknown>)) {
    const 值 = (输出 as Record<string, unknown>)[键]
    if (值 === undefined) continue // 无值可省略字段
    if (typeof 值 === 'string' || typeof 值 === 'boolean') {
      干净[键] = 值
      continue
    }
    if (typeof 值 === 'number' && Number.isFinite(值)) {
      干净[键] = 值
      continue
    }
    return { ok: false, 字段: 键, 实际: 描述类型(值), 提示: 提示文本 }
  }
  return { ok: true, 干净 }
}

/**
 * 门禁版检查：不合法直接抛错（由状态机的 `.catch` 记成这一格失败）。
 * 错误信息里带蓝图、单元、字段、实际类型，方便方法作者定位。
 */
export function 校验输出(蓝图名: string, 单元名: string, 输出: unknown): Record<string, 输出原始值> {
  const 结果 = 检查输出(输出)
  if (结果.ok) return 结果.干净
  throw new Error(
    `蓝图「${蓝图名}」单元「${单元名}」的输出不合法：字段「${结果.字段}」是「${结果.实际}」。${结果.提示}`,
  )
}

/** 给提示词 / 文档复用的一句话规则 */
export const 输出规则说明 =
  '方法必须 `return { 字段: 值 }`（平坦对象）；字段值只允许 string / boolean / 有限 number，' +
  '没有值就省略字段。需要传对象、数组或 Map 时，自己编码成字符串（如 JSON.stringify），接收方再还原。'
