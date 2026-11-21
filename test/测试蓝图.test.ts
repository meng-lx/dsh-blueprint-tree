import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'
import { 直接写图 } from './造图.ts'

隔离登记表()

/** 建一个项目，返回项目名 */
async function 新项目(): Promise<string> {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-tb-'))
  const 名 = 唯一名('蓝图测试')
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 名, 路径: 根 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return 名
}

/** 写方法文件（当前版本） */
function 写方法(项目: string, 图名: string, 源码: string): void {
  fs.writeFileSync(文件(项目, `${图名}.方法.ts`), 源码, 'utf8')
}

const 最小图 = {
  格式版本: 1,
  名: '主蓝图',
  开始: '开始',
  结束: '结束',
  同步性: 0,
  单元: [
    { 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: ['甲'] },
    { 名: '甲', 类型: '硬', 标签: '无', 状态: '提醒', 下层: ['结束'] },
    { 名: '结束', 类型: '结束', 标签: '无', 状态: '提醒', 下层: ['$结束'] },
  ],
}

test('测试蓝图：最小链跑通', async () => {
  const 项目 = await 新项目()
  直接写图(项目, '主蓝图', 最小图)
  写方法(
    项目,
    '主蓝图',
    `export const 方法 = {
  "开始"(输入: 上游输入[]) { return {}; },
  "甲"(输入: 上游输入[]) { return {}; },
  "结束"(输入: 上游输入[]) { return {}; },
}
`,
  )

  const r = await 执行({ cmd: '测试蓝图', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) return
  const 数据 = r.数据 as Record<string, unknown>
  assert.equal(数据.结局, '完成')
  assert.deepEqual(数据.跑了, ['开始', '甲', '结束'])
})

test('测试蓝图：无视状态 —— 失效单元照样跑', async () => {
  const 项目 = await 新项目()
  直接写图(项目, '主蓝图', {
    ...最小图,
    单元: 最小图.单元.map((u) => (u.名 === '甲' ? { ...u, 状态: '失效' } : u)),
  })
  写方法(
    项目,
    '主蓝图',
    `export const 方法 = {
  "开始"(输入: 上游输入[]) { return {}; },
  "甲"(输入: 上游输入[]) { return {}; },
  "结束"(输入: 上游输入[]) { return {}; },
}
`,
  )

  const r = await 执行({ cmd: '测试蓝图', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) return
  const 数据 = r.数据 as Record<string, unknown>
  assert.ok((数据.跑了 as string[]).includes('甲'), '失效的甲应该也跑了')
})

test('测试蓝图：子蓝图单元给假输出，不进子图', async () => {
  const 项目 = await 新项目()
  直接写图(项目, '主蓝图', {
    格式版本: 1,
    名: '主蓝图',
    开始: '开始',
    结束: '结束',
    同步性: 0,
    单元: [
      { 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: ['子'] },
      { 名: '子', 类型: '子蓝图', 标签: '无', 状态: '提醒', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 标签: '无', 状态: '提醒', 下层: ['$结束'] },
    ],
  })
  // 子图存在、有自己的方法，但蓝图测试不该进去
  直接写图(项目, '子', {
    格式版本: 1,
    名: '子',
    开始: '子入口',
    结束: null,
    同步性: 1,
    单元: [
      { 名: '子入口', 类型: '软', 标签: '无', 状态: '提醒', 下层: ['$结束'] },
    ],
  })
  写方法(
    项目,
    '主蓝图',
    `export const 方法 = {
  "开始"(输入: 上游输入[]) { return {}; },
  "结束"(输入: 上游输入[]) { return {}; },
}
`,
  )

  const r = await 执行({ cmd: '测试蓝图', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) return
  const 数据 = r.数据 as Record<string, unknown>
  assert.deepEqual(数据.跑了, ['开始', '子', '结束'], '子蓝图单元当普通单元跑，不进子图')
  assert.ok(Array.isArray(数据.假输出) && (数据.假输出 as string[]).includes('子'))
})

test('测试蓝图：压测 5 次，次数和耗时都在', async () => {
  const 项目 = await 新项目()
  直接写图(项目, '主蓝图', 最小图)
  写方法(
    项目,
    '主蓝图',
    `export const 方法 = {
  "开始"(输入: 上游输入[]) { return {}; },
  "甲"(输入: 上游输入[]) { return {}; },
  "结束"(输入: 上游输入[]) { return {}; },
}
`,
  )

  const r = await 执行({ cmd: '测试蓝图', 参数: { 项目, 次数: 5 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) return
  const 数据 = r.数据 as Record<string, unknown>
  assert.equal(数据.次数, 5)
  assert.equal(数据.成功, 5)
  const 耗时 = 数据.耗时毫秒 as Record<string, number>
  assert.ok(耗时.总 >= 0 && 耗时.平均 >= 0)
})

test('测试蓝图：没有开始单元 ⇒ 报错', async () => {
  const 项目 = await 新项目()
  直接写图(项目, '主蓝图', {
    格式版本: 1,
    名: '主蓝图',
    开始: null,
    结束: null,
    同步性: 0,
    单元: [],
  })

  const r = await 执行({ cmd: '测试蓝图', 参数: { 项目 } })
  assert.equal(r.ok, false, JSON.stringify(r))
})
