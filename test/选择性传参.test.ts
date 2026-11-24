import test from 'node:test'
import assert from 'node:assert/strict'
import { 方法骨架, 循环换名表 } from '../src/方法命令.ts'

// 用户 m17963：软单元「选择性传参」——只有拉起它的那一路才给数据，
// 其余上游的变量提前声明好（值恒 undefined），正文引用不会报未定义。

test('软单元：启动名等于上游才传参，所有变量提前声明', () => {
  const 骨架 = 方法骨架('丙', ['甲', '乙'], { 甲: { a: 'number' } }, false, true)
  assert.match(骨架, /const 启动 = 输入\.length === 1 \? 输入\[0\]\?\.来源 : undefined;/, '要取启动来源')
  assert.match(骨架, /let 上游_甲: \{ a: number; \} \| undefined;/, '甲要先声明')
  assert.match(骨架, /let 上游_乙: Record<string, unknown> \| undefined;/, '乙也要先声明')
  assert.match(骨架, /if \(启动 === "甲"\) 上游_甲 = 输入\.find/, '甲只有被它拉起才传参')
  assert.match(骨架, /if \(启动 === "乙"\) 上游_乙 = 输入\.find/, '乙同理')
})

test('硬单元：不带条件，所有上游都传参', () => {
  const 骨架 = 方法骨架('丙', ['甲', '乙'], undefined, false, false)
  assert.ok(!骨架.includes('启动 ==='), '硬单元不该有启动条件')
  assert.match(骨架, /上游_甲 = 输入\.find/)
  assert.match(骨架, /上游_乙 = 输入\.find/)
})

test('没上游的单元：不生成传参段', () => {
  const 骨架 = 方法骨架('开始', [], undefined, false, false)
  assert.ok(!骨架.includes('上游_'), '没上游就不该有上游变量')
})

test('循环向量：拿发出它的上游名义传参', () => {
  // 用户 m18019：循环向量不自己当来源，用它的上游（发出它的选择单元）的名字
  const 蓝图 = {
    名: '主蓝图',
    开始: '开始',
    单元: [
      { 名: '开始', 类型: '开始', 下层: ['甲'] },
      { 名: '甲', 类型: '选择', 下层: ['循环1'] },
      { 名: '循环1', 类型: '循环', 下层: ['丙'] },
      { 名: '丙', 类型: '软', 下层: [] },
    ],
  } as never

  const 换名 = 循环换名表(蓝图)
  assert.deepEqual(换名, { 循环1: '甲' })

  const 骨架 = 方法骨架('丙', ['循环1'], undefined, false, true, 换名)
  assert.ok(!骨架.includes('上游_循环1'), '不该用循环向量自己的名字')
  assert.match(骨架, /let 上游_甲:/, '要用上游的名字声明')
  assert.match(骨架, /if \(启动 === "甲"\) 上游_甲 = 输入\.find/, '传参也按上游名字')
})
