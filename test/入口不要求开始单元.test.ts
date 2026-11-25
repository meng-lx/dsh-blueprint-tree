// 测评第 6 条：入口不要求真「开始」单元
//
// 口径：入口由「蓝图.开始」锚点决定。锚点指的那一格就是顶层点火口 ——
// 它可以不是「开始」类型，同样不跑方法、把点火包交给下游。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 跑 } from '../src/状态机.ts'
import type { 引擎选项 } from '../src/状态机.ts'
import type { 蓝图, 单元 } from '../src/commands/unit-add.ts'
import { 查锚点 } from '../src/校验.ts'

function 造图(名: string, 单元们: Partial<单元>[], 开始: string | null): 蓝图 {
  return {
    格式版本: 1,
    名,
    开始: 开始 ?? undefined,
    结束: '结束',
    同步性: 0,
    单元: 单元们.map((u) => ({
      类型: '硬',
      标签: '无',
      状态: '提醒',
      ...u,
      名: u.名!,
    })) as 单元[],
  }
}

test('入口是软单元：锚点指它，点火包照样交给下游', async () => {
  const 图 = 造图(
    '主蓝图',
    [
      { 名: '入口', 类型: '软', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束' },
    ],
    '入口',
  )
  let 入口方法跑了 = false
  const 甲收到的: unknown[] = []
  const 方法: 引擎选项['方法'] = {
    入口: () => {
      入口方法跑了 = true
      return {}
    },
    甲: (输入) => {
      甲收到的.push(...输入)
      return { 好: true }
    },
  }
  const 结果 = await 跑(图, {
    读蓝图: () => 图,
    方法,
    共享数据: {},
    主蓝图名: '主蓝图',
    点火: { 命令: '测试', 值: 1 },
  })
  assert.equal(结果.结局, '完成')
  assert.equal(入口方法跑了, false, '入口是点火口，不能跑方法')
  assert.equal(甲收到的.length, 1)
  const 首 = 甲收到的[0] as { 来源: string; 数据: Record<string, unknown> }
  assert.equal(首.来源, '入口')
  assert.deepEqual(首.数据, { 命令: '测试', 值: 1 }, '下游拿到的应是点火包')
})

test('校验：没有「开始」类型、但写了锚点 ⇒ 不算错', () => {
  const 图 = 造图(
    '主蓝图',
    [
      { 名: '入口', 类型: '软', 下层: ['结束'] },
      { 名: '结束', 类型: '结束' },
    ],
    '入口',
  )
  const 问题 = 查锚点(图, false)
  const 码 = 问题.map((p) => p.码)
  assert.ok(!码.includes('C1'), JSON.stringify(问题, null, 2))
  assert.ok(!码.includes('C3'), JSON.stringify(问题, null, 2))
})

test('校验：既没锚点也没有「开始」类型 ⇒ C1', () => {
  const 图 = 造图(
    '主蓝图',
    [
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束' },
    ],
    null,
  )
  const 码 = 查锚点(图, false).filter((p) => p.级别 === '错').map((p) => p.码)
  assert.ok(码.includes('C1'), 码.join(','))
})

test('校验：两个「开始」类型 ⇒ C1', () => {
  const 图 = 造图(
    '主蓝图',
    [
      { 名: '开始', 类型: '开始', 下层: ['甲'] },
      { 名: '开始2', 类型: '开始', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束' },
    ],
    '开始',
  )
  const 码 = 查锚点(图, false).filter((p) => p.级别 === '错').map((p) => p.码)
  assert.ok(码.includes('C1'), 码.join(','))
})
