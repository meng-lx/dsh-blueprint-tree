// 2026-11-25 开发交接第 1 节：输出门禁
// 普通输出必须是平坦的普通记录，字段值只允许 string / boolean / 有限 number；
// 非法输出不落盘、不激发下游。点火包（带 __内部 标记）走内部通道，不进门禁。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 跑 } from '../src/状态机.ts'
import type { 引擎选项 } from '../src/状态机.ts'
import type { 蓝图, 单元 } from '../src/commands/unit-add.ts'

function 造图(名: string, 单元们: Partial<单元>[], 开始?: string): 蓝图 {
  return {
    格式版本: 1,
    名,
    开始: 开始 ?? '开始',
    结束: '结束',
    同步性: 0,
    单元: 单元们.map((u) => ({ 类型: '硬', 标签: '无', 状态: '提醒', ...u, 名: u.名! })) as 单元[],
  }
}

/** 只跑「甲」这一格（单测模式，不带点火包 ⇒ 输入为空 ⇒ 走门禁） */
async function 跑一格(方法: (输入: unknown[]) => unknown, 下游: string[] = ['结束']) {
  const 图 = 造图('主蓝图', [
    { 名: '甲', 类型: '硬', 下层: 下游 },
    { 名: '结束', 类型: '结束', 下层: ['$结束'] },
  ])
  const 选项: 引擎选项 = {
    读蓝图: (名) => (名 === '主蓝图' ? 图 : undefined),
    蓝图名们: () => ['主蓝图'],
    方法: { 甲: 方法 as never },
    共享数据: {},
    主蓝图名: '主蓝图',
    测试: '单元',
    起始: { 蓝图: '主蓝图', 单元: '甲' },
    最多步数: 10,
    最多并发: 8,
  }
  const 结果 = await 跑(图, 选项)
  return { 结果, 共享: 选项.共享数据 }
}

test('门禁：平坦原始值放行，undefined 字段当作省略', async () => {
  const { 结果, 共享 } = await 跑一格(() => ({ 文字: 'x', 开关: true, 数: 1.5, 空着: undefined }))
  assert.equal(结果.结局, '完成')
  assert.deepEqual(共享['主蓝图']?.甲, { 文字: 'x', 开关: true, 数: 1.5 })
})

test('门禁：无方法 / 空返回归一化成空记录', async () => {
  const { 结果, 共享 } = await 跑一格(() => undefined)
  assert.equal(结果.结局, '完成')
  assert.deepEqual(共享['主蓝图']?.甲, {})
})

test('门禁：嵌套对象 ⇒ 失败，且不落盘', async () => {
  const { 结果, 共享 } = await 跑一格(() => ({ 参数: { 名: 'x' } }))
  assert.equal(结果.结局, '失败')
  const 消息 = String((结果.错误 as Error).message)
  assert.match(消息, /主蓝图/)
  assert.match(消息, /甲/)
  assert.match(消息, /参数/)
  assert.match(消息, /对象/)
  assert.equal(共享['主蓝图']?.甲, undefined)
})

test('门禁：数组 / Map / 函数 / symbol / bigint / NaN / Infinity / null 都拒绝', async () => {
  const 案例: [string, unknown, RegExp][] = [
    ['数组', [1, 2], /数组/],
    ['Map', new Map([['a', 1]]), /Map/],
    ['函数', () => 1, /函数/],
    ['symbol', Symbol('s'), /symbol/],
    ['bigint', 10n, /bigint/],
    ['NaN', Number.NaN, /NaN/],
    ['Infinity', Number.POSITIVE_INFINITY, /Infinity/],
    ['null', null, /null/],
  ]
  for (const [名, 值, 期望] of 案例) {
    const { 结果, 共享 } = await 跑一格(() => ({ 值 }))
    assert.equal(结果.结局, '失败', 名 + ' 应该被拒绝')
    assert.match(String((结果.错误 as Error).message), 期望, 名 + ' 的错误信息要写清类型')
    assert.equal(共享['主蓝图']?.甲, undefined, 名 + ' 不许部分落盘')
  }
})

test('门禁：symbol 键字段拒绝', async () => {
  const 键 = Symbol('k')
  const { 结果 } = await 跑一格(() => ({ [键]: 1 }))
  assert.equal(结果.结局, '失败')
  assert.match(String((结果.错误 as Error).message), /symbol/)
})

test('门禁：非法输出不激发下游', async () => {
  let 下游跑了 = false
  const 图 = 造图('主蓝图', [
    { 名: '甲', 类型: '硬', 下层: ['乙'] },
    { 名: '乙', 类型: '硬', 下层: ['结束'] },
    { 名: '结束', 类型: '结束', 下层: ['$结束'] },
  ])
  const 选项: 引擎选项 = {
    读蓝图: () => 图,
    蓝图名们: () => ['主蓝图'],
    方法: { 甲: () => ({ 嵌套: { a: 1 } }), 乙: () => { 下游跑了 = true; return {} } },
    共享数据: {},
    主蓝图名: '主蓝图',
    测试: '单元',
    起始: { 蓝图: '主蓝图', 单元: '甲' },
    最多步数: 10,
  }
  const 结果 = await 跑(图, 选项)
  assert.equal(结果.结局, '失败')
  assert.equal(下游跑了, false)
})

test('门禁：点火包是内部通道，带宿主与嵌套参数也能过', async () => {
  const 图 = 造图('主蓝图', [
    { 名: '开始', 类型: '开始', 下层: ['甲'] },
    { 名: '甲', 类型: '硬', 下层: ['结束'] },
    { 名: '结束', 类型: '结束', 下层: ['$结束'] },
  ])
  const 宿主 = { 写文件: () => 1 }
  const 选项: 引擎选项 = {
    读蓝图: () => 图,
    蓝图名们: () => ['主蓝图'],
    方法: { 甲: (输入) => ({ 宿主: (输入[0]?.数据 as Record<string, unknown>)?.宿主, 参数: { 名: 'x' } }) },
    共享数据: {},
    主蓝图名: '主蓝图',
    点火: { 项目: '演示', 命令: 'unit.get', 参数: { 蓝图: '主蓝图' }, 宿主 },
    最多步数: 10,
  }
  const 结果 = await 跑(图, 选项)
  assert.equal(结果.结局, '完成')
  const 甲 = 选项.共享数据['主蓝图']?.甲 as Record<string, unknown>
  assert.equal(甲?.宿主, 宿主)
  assert.deepEqual(甲?.参数, { 名: 'x' })
})
