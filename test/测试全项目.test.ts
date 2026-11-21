// 测试全项目 —— 从主蓝图的开始单元起跑整张图

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 直接写图 } from './造图.ts'

/** 建一个临时项目，返回 { 项目, 根 } */
async function 新项目() {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-test-project-'))
  const 项目 = `测项目${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 名: 项目, 路径: 根 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return { 项目, 根 }
}

/** 写方法文件 */
function 写方法(根: string, 名: string, 源码: string) {
  fs.writeFileSync(path.join(根, '主蓝图.方法.ts'), 源码, 'utf8')
}

function 图(单元们: Record<string, unknown>[]) {
  return {
    格式版本: 1,
    名: '主蓝图',
    开始: '开始',
    结束: '结束',
    同步性: 0,
    单元: 单元们,
  }
}

test('测试全项目：最小链跑通', async () => {
  const { 项目, 根 } = await 新项目()
  直接写图(
    项目,
    '主蓝图',
    图([
      { 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 标签: '无', 状态: '提醒', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 标签: '无', 状态: '提醒', 下层: ['$结束'] },
    ]),
  )
  写方法(
    根,
    '主蓝图',
    `export const 方法 = {
  "开始"(输入: 上游输入[]) { return {} },
  "甲"(输入: 上游输入[]) { return {} },
  "结束"(输入: 上游输入[]) { return {} },
}`,
  )

  const r = await 执行({ cmd: '测试全项目', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) return
  const d = r.数据 as Record<string, unknown>
  assert.equal(d.结局, '完成', JSON.stringify(d))
  assert.deepEqual(d.跑了, ['开始', '甲', '结束'])
})

test('测试全项目：无视状态 —— 失效单元照样跑', async () => {
  const { 项目, 根 } = await 新项目()
  直接写图(
    项目,
    '主蓝图',
    图([
      { 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 标签: '无', 状态: '失效', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 标签: '无', 状态: '提醒', 下层: ['$结束'] },
    ]),
  )
  写方法(
    根,
    '主蓝图',
    `export const 方法 = {
  "开始"(输入: 上游输入[]) { return {} },
  "甲"(输入: 上游输入[]) { return {} },
  "结束"(输入: 上游输入[]) { return {} },
}`,
  )

  const r = await 执行({ cmd: '测试全项目', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) return
  const d = r.数据 as Record<string, unknown>
  assert.equal(d.结局, '完成', JSON.stringify(d))
  assert.ok((d.跑了 as string[]).includes('甲'), '失效的甲也该跑')
})

test('测试全项目：压测 3 次，次数和耗时都在', async () => {
  const { 项目, 根 } = await 新项目()
  直接写图(
    项目,
    '主蓝图',
    图([
      { 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 标签: '无', 状态: '提醒', 下层: ['$结束'] },
    ]),
  )
  写方法(
    根,
    '主蓝图',
    `export const 方法 = {
  "开始"(输入: 上游输入[]) { return {} },
  "结束"(输入: 上游输入[]) { return {} },
}`,
  )

  const r = await 执行({ cmd: '测试全项目', 参数: { 项目, 次数: 3 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) return
  const d = r.数据 as Record<string, unknown>
  assert.equal(d.次数, 3)
  assert.equal(d.成功, 3)
  const 耗时 = d.耗时毫秒 as Record<string, number>
  assert.ok(耗时.总 >= 0)
  assert.ok(耗时.平均 >= 0)
})

test('测试全项目：主蓝图不存在 ⇒ 报错', async () => {
  const { 项目 } = await 新项目()
  // 刚建的项目自带主蓝图，所以这里删掉它
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-test-project-'))
  const 项目2 = `空项目${Date.now()}`
  await 执行({ cmd: '创建项目', 参数: { 锚点: false, 名: 项目2, 路径: 根 } })
  for (const f of fs.readdirSync(根)) {
    if (f.endsWith('.json') && f.startsWith('主蓝图')) fs.rmSync(path.join(根, f))
  }
  const r = await 执行({ cmd: '测试全项目', 参数: { 项目: 项目2 } })
  assert.equal(r.ok, false, JSON.stringify(r))
  项目 // 占位，避免 lint 抱怨
})
