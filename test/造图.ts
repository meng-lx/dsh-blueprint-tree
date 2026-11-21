// 测试用：直接改蓝图 json（绕过命令的检查）
//
// 为什么需要：2026-11-14 起 `unit.add` 会跑检查表（B1 悬空、D/E 组、H1 上限…），
// 想造「中间态」或「故意坏掉」的图，就不能再靠 `unit.add` 一步步建了 ——
// 每一步都会被下一阶段的规则拦下来。

import fs from 'node:fs'
import { 文件 } from './工具.ts'

export interface 测试单元 {
  名: string
  类型: string
  标签?: string
  状态?: string
  下层?: string[]
  功能?: string
}

export interface 测试蓝图 {
  名?: string
  开始?: string | null
  结束?: string | null
  同步性?: 0 | 1
  单元: 测试单元[]
}

/** 直接把一张图写进项目（不经过任何命令，不跑任何检查） */
export function 直接写图(项目: string, 图名: string, 图: 测试蓝图): void {
  const 全 = {
    格式版本: 1,
    名: 图名,
    开始: 图.开始 ?? null,
    结束: 图.结束 ?? null,
    同步性: 图.同步性 ?? 0,
    单元: 图.单元.map((u) => {
      const 出: Record<string, unknown> = {
        名: u.名,
        类型: u.类型,
        标签: u.标签 ?? '无',
        状态: u.状态 ?? '正常',
      }
      if (u.下层 && u.下层.length) 出.下层 = u.下层
      if (u.功能 !== undefined) 出.功能 = u.功能
      return 出
    }),
  }
  fs.writeFileSync(文件(项目, `${图名}.json`), JSON.stringify(全, null, 2) + '\n', 'utf8')
}
