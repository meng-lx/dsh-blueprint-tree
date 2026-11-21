// 控制器的通用类型
// 所有命令的输入输出都走这里，AI 和界面看到的是同一套形状。

/** 一条指令：AI（工具调用）或界面（HTTP）发过来的 */
export interface 指令 {
  cmd: string
  参数: Record<string, unknown>
}

/** 错误 */
export interface 错误信息 {
  类型: '未知命令' | '参数' | '校验' | 'IO' | '已存在' | '不存在'
  消息: string
  位置?: string | string[]
}

/** 统一返回 */
export type 结果<T = unknown> =
  | { ok: true; 数据: T }
  | { ok: false; 错误: 错误信息 }

export function 成功<T>(数据: T): 结果<T> {
  return { ok: true, 数据 }
}

export function 失败(
  类型: 错误信息['类型'],
  消息: string,
  位置?: string | string[],
): 结果<never> {
  return { ok: false, 错误: { 类型, 消息, 位置 } }
}
