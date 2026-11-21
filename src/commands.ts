// 命令表：规范名 ↔ 中文别名
//
// 用户 2026-11-07：「兼容一下中文，让我能用中文命令」
// ⇒ cmd 可以直接写中文；英文规范名也照常认。

import type { 结果 } from './types.ts'
import { 建项目 } from './commands/project-create.ts'
import { 添加项目 } from './commands/project-add.ts'
import { 列项目 } from './commands/project-list.ts'
import { 建单元 } from './commands/unit-add.ts'
import { 删项目 } from './commands/project-remove.ts'
import { 删单元 } from './commands/unit-remove.ts'
import { 改状态 } from './commands/unit-status.ts'
import { 改单元 } from './commands/unit-update.ts'
import { 还原方法 } from './commands/method-restore.ts'
import { 运行方法 } from './commands/run.ts'
import { 结束运行 } from './commands/end.ts'
import { 测试单元 } from './commands/test-unit.ts'
import { 测试蓝图 } from './commands/test-blueprint.ts'
import { 测试全项目 } from './commands/test-project.ts'
import { 看蓝图 } from './commands/blueprint-show.ts'
import { 查之间 } from './commands/blueprint-between.ts'
import { 查蓝图 } from './commands/blueprint-validate.ts'
import { 看结构 } from './commands/blueprint-tree.ts'
import { 看详情 } from './commands/blueprint-detail.ts'
import { 自动排列 } from './commands/blueprint-arrange.ts'
import { 看图 } from './commands/blueprint-graph.ts'
import { 看单元 } from './commands/unit-get.ts'
import { 生成方法 } from './commands/method-generate.ts'
import { 写方法 } from './commands/method-edit.ts'
import { 方法说明 } from './commands/method-brief.ts'
import { 刷新页面, 读刷新 } from './commands/page-refresh.ts'

export interface 命令定义 {
  /** 规范名，英文两段式：域.动作 */
  名: string
  /** 给 AI / 界面看的一句话说明 */
  说明: string
  /** 中文别名（可多个，含口胡写法） */
  中文: string[]
  执行(参数: Record<string, unknown>): Promise<结果> | 结果
}

const 全部: 命令定义[] = [
  建项目,
  添加项目,
  列项目,
  看蓝图,
  看结构,
  看详情,
  看图,
  看单元,
  查蓝图,
  查之间,
  建单元,
  删项目,
  删单元,
  改状态,
  改单元,
  刷新页面,
  读刷新,
  生成方法,
  写方法,
  还原方法,
  运行方法,
  结束运行,
  测试单元,
  测试蓝图,
  测试全项目,
  自动排列,
]

/** 中文 / 英文别名 → 规范名。全部 trim + 小写后比较，所以大小写和空格都不敏感 */
const 别名表: Record<string, string> = {}
for (const c of 全部) {
  别名表[c.名] = c.名
  for (const a of c.中文) 别名表[a] = c.名
}

function 规整(s: string): string {
  return s.trim().toLowerCase()
}

export function 取命令(cmd: string): 命令定义 | undefined {
  const 规范 = 别名表[cmd.trim()] ?? 别名表[规整(cmd)]
  if (!规范) return undefined
  return 全部.find((c) => c.名 === 规范)
}

/** 给 AI 工具描述 / 界面帮助页用 */
export function 命令清单(): { 名: string; 中文: string[]; 说明: string }[] {
  return 全部.map((c) => ({ 名: c.名, 中文: c.中文, 说明: c.说明 }))
}
