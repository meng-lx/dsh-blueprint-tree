// 待做池的三态（测评第 5 条：背压与排序）
//
// 口径（交接 2026-11-25「硬目标 H 的三态」）：
//   ① 没有待办     ⇒ 建一条，记下这一路数据
//   ② 正在收集仍缺 ⇒ 补到同一条，不另建
//   ③ 这一路已交过 / 那条在跑 ⇒ 暂不接收，留着等本轮结束再重试（有界）

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 待做池 } from '../src/待做池.ts'
import type { 待做项 } from '../src/待做池.ts'

function 项(补: Partial<待做项> = {}): 待做项 {
  return {
    蓝图: '主蓝图',
    单元: '汇',
    还差: [],
    标签: null,
    时间戳: 0,
    符号: null,
    携带: [],
    ...补,
  }
}

test('三态①：没有待办 ⇒ 建一条，带上这一路数据', () => {
  const 池 = new 待做池()
  assert.equal(池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 1 } }] })), undefined)
  assert.equal(池.长度, 1)
  assert.equal(池.待交付数, 0)

  const 取到 = 池.取()!
  assert.deepEqual(取到.携带, [{ 来源: '甲', 数据: { a: 1 } }])
})

test('三态②：还缺别的一路 ⇒ 补进同一条，不另建', () => {
  const 池 = new 待做池()
  池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 1 } }] }))
  assert.equal(池.录入(项({ 携带: [{ 来源: '乙', 数据: { b: 2 } }] })), undefined, '第二路照收')

  assert.equal(池.长度, 1, '仍然只有一条待办')
  assert.equal(池.待交付数, 0)

  const 取到 = 池.取()!
  assert.deepEqual(
    取到.携带?.map((x) => x.来源),
    ['甲', '乙'],
  )
})

test('三态③：同一路又来了 ⇒ 暂不接收，上游挂住', () => {
  const 池 = new 待做池()
  池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 1 } }] }))

  const 挂起 = 池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 2 } }] }))
  assert.ok(挂起 instanceof Promise, '上游被挂住（背压）')
  assert.equal(池.长度, 1, '没有变成两条')
  assert.equal(池.待交付数, 1, '这一路被留着等重试')
})

test('那位在跑 ⇒ 新到的一路也先暂存，等它跑完再建', () => {
  const 池 = new 待做池()
  池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 1 } }] }))
  const 取到 = 池.取()!
  assert.equal(取到.标签, '在跑')

  assert.ok(池.录入(项({ 携带: [{ 来源: '丙', 数据: { c: 3 } }] })) instanceof Promise)
  assert.equal(池.待交付数, 1)

  池.完成(取到)
  assert.equal(池.待交付数, 0, '完成时自动重试，队列被消化掉')
  assert.equal(池.长度, 1, '重试建出了下一轮那条')

  const 下一条 = 池.取()!
  assert.deepEqual(下一条.携带, [{ 来源: '丙', 数据: { c: 3 } }])
})

test('完成唤起重试：下一轮按新数据重新建，不覆盖旧值', () => {
  const 池 = new 待做池()
  池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 1 } }] }))
  void 池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 2 } }] })) // 暂存

  const 本轮 = 池.取()!
  池.完成(本轮)

  assert.equal(池.待交付数, 0)
  assert.equal(池.长度, 1)
  const 下一轮 = 池.取()!
  assert.deepEqual(下一轮.携带, [{ 来源: '甲', 数据: { a: 2 } }], '用的是新到的数据，不是旧的')
})

test('积压有界：同一键攒满就丢最老的', () => {
  const 池 = new 待做池()
  池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 0 } }] }))
  for (let i = 1; i <= 6; i++) void 池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: i } }] }))

  assert.equal(池.待交付数, 4, '上限 4 份')
  assert.equal(池.丢弃数, 2, '多出来的丢最老的')
})

test('清空：暂不接收的投递也不残留（失败/中止清理）', () => {
  const 池 = new 待做池()
  池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 1 } }] }))
  void 池.录入(项({ 携带: [{ 来源: '甲', 数据: { a: 2 } }] }))
  assert.equal(池.待交付数, 1)

  池.清空()
  assert.equal(池.长度, 0)
  assert.equal(池.待交付数, 0)
})
