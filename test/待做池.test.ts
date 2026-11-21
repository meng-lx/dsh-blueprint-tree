// 待做池的单元测试
//
// 只测池本身，不接状态机、不读蓝图。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 待做池 } from '../src/待做池.ts'
import type { 待做项, 单元标识 } from '../src/待做池.ts'

const 甲: 单元标识 = { 蓝图: '主蓝图', 单元: '甲' }
const 乙: 单元标识 = { 蓝图: '主蓝图', 单元: '乙' }

function 项(名: string, 还差: 单元标识[] = []): 待做项 {
  return { 蓝图: '主蓝图', 单元: 名, 还差, 标签: null, 时间戳: 0, 符号: null }
}

test('录入 → 取 → 完成', () => {
  const 池 = new 待做池()
  assert.equal(池.录入(项('甲')), undefined, '池里没有 ⇒ 直接进池')
  assert.equal(池.长度, 1)

  const 取到 = 池.取()
  assert.equal(取到?.单元, '甲')
  assert.equal(取到?.标签, '在跑', '取走时打标签')
  assert.equal(池.取(), undefined, '已经被占，不能再取')

  池.完成(取到!)
  assert.equal(池.长度, 0)
})

test('还差没删空时取不到', () => {
  const 池 = new 待做池()
  池.录入(项('乙', [甲])) // 还差「甲」

  assert.equal(池.有可执行, false)
  assert.equal(池.取(), undefined)

  assert.equal(池.到一次('主蓝图', '乙', 甲), true)
  assert.equal(池.有可执行, true, '删空了就能做')

  const 取到 = 池.取()
  assert.equal(取到?.单元, '乙')
})

test('到一次：上游不在还差里就返回 false', () => {
  const 池 = new 待做池()
  池.录入(项('乙', [甲]))
  const 丙: 单元标识 = { 蓝图: '主蓝图', 单元: '丙' }

  assert.equal(池.到一次('主蓝图', '乙', 丙), false)
  assert.equal(池.到一次('主蓝图', '不存在', 甲), false)
})

test('池里已有 ⇒ 上游挂起，等腾位置才醒', async () => {
  const 池 = new 待做池()
  池.录入(项('甲'))

  let 醒来 = false
  const 挂起 = 池.录入(项('甲'))!
  assert.ok(挂起 instanceof Promise)
  挂起.then(() => {
    醒来 = true
  })

  // 还没完成 ⇒ 上游一直挂着
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(醒来, false)
  assert.equal(池.长度, 1, '同一条记录，不会变成两条')

  // 完成之后 ⇒ 唤醒
  const 取到 = 池.取()!
  池.完成(取到)
  await 挂起
  assert.equal(醒来, true)
  assert.equal(池.长度, 0)

  // 醒来的上游重试录入 ⇒ 这次能进
  assert.equal(池.录入(项('甲')), undefined)
  assert.equal(池.长度, 1)
})

test('不同蓝图下的同名单元互不影响', () => {
  const 池 = new 待做池()
  池.录入({ 蓝图: '主蓝图', 单元: '甲', 还差: [], 标签: null, 时间戳: 0, 符号: null })
  池.录入({ 蓝图: '登录流程', 单元: '甲', 还差: [], 标签: null, 时间戳: 0, 符号: null })
  assert.equal(池.长度, 2)

  // 登录流程/甲 已在池里 ⇒ 主蓝图/甲 不受影响
  assert.equal(池.录入({ 蓝图: '主蓝图', 单元: '甲', 还差: [], 标签: null, 时间戳: 0, 符号: null }) instanceof Promise, true)
})

test('软单元：还差为空 ⇒ 一进池就能取', () => {
  const 池 = new 待做池()
  池.录入(项('软甲')) // 录入时不计上游 ⇒ 还差 []
  assert.equal(池.取()?.单元, '软甲')
})

test('全部() 是只读快照', () => {
  const 池 = new 待做池()
  池.录入(项('甲'))
  const 看 = 池.全部()
  assert.equal(看.length, 1)
  assert.equal(看[0].单元, '甲')
})
