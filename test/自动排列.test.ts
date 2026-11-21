import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'
import { 直接写图 } from './造图.ts'

隔离登记表()

const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-排列-'))

async function 建项目(单元们: any[]): Promise<string> {
  const 项目 = 唯一名('排列')
  const r = await 执行({ cmd: '创建项目', 参数: { 名: 项目, 路径: 根, 锚点: false } })
  assert.equal(r.ok, true, JSON.stringify(r))
  for (const u of 单元们) {
    const a = await 执行({ cmd: '创建单元', 参数: { 项目, 单元: u } })
    assert.equal(a.ok, true, `${u.名}: ${JSON.stringify(a)}`)
  }
  return 项目
}

function 读(项目: string): any {
  return JSON.parse(fs.readFileSync(文件(项目, '主蓝图.json'), 'utf8'))
}

function 坐标(图: any, 名: string): [number, number] | undefined {
  return 图.单元.find((u: any) => u.名 === 名)?.坐标
}

test('自动排列：开始在最上、结束在最下，中间的按层往下', async () => {
  const 项目 = await 建项目([
    { 名: '结束', 类型: '结束', 下层: ['$结束'] },
    { 名: '甲', 类型: '硬', 下层: ['结束'] },
    { 名: '开始', 类型: '开始', 下层: ['甲'] },
  ])
  const r = await 执行({ cmd: '自动排列', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 图 = 读(项目)
  const 开 = 坐标(图, '开始')!
  const 甲 = 坐标(图, '甲')!
  const 结 = 坐标(图, '结束')!
  assert.ok(开[1] < 甲[1], '开始要在甲上面')
  assert.ok(甲[1] < 结[1], '甲要在结束上面')
  assert.equal(图.同步性 !== undefined, true)
})

test('自动排列：同一层的并排，不同层上下错开', async () => {
  const 项目 = await 建项目([
    { 名: '结束', 类型: '结束', 下层: ['$结束'] },
    { 名: '尾1', 类型: '硬', 下层: ['结束'] },
    { 名: '尾2', 类型: '硬', 下层: ['结束'] },
    { 名: '左', 类型: '硬', 下层: ['尾1'] },
    { 名: '右', 类型: '硬', 下层: ['尾2'] },
    { 名: '开始', 类型: '开始', 下层: ['左', '右'] },
  ])
  const r = await 执行({ cmd: '自动排列', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 图 = 读(项目)
  const 左 = 坐标(图, '左')!
  const 右 = 坐标(图, '右')!
  const 尾1 = 坐标(图, '尾1')!
  const 尾2 = 坐标(图, '尾2')!

  assert.equal(左[1], 右[1], '左和右应同一层')
  assert.notEqual(左[0], 右[0], '同一层不能叠在一起')
  assert.equal(尾1[1], 尾2[1], '尾1和尾2应同一层')
  assert.ok(左[1] < 尾1[1], '左右在尾巴上面')
})

test('自动排列：尽量不交叉 —— 左→尾1、右→尾2 时尾1在尾2左边', async () => {
  const 项目 = await 建项目([
    { 名: '结束', 类型: '结束', 下层: ['$结束'] },
    { 名: '尾2', 类型: '硬', 下层: ['结束'] },
    { 名: '尾1', 类型: '硬', 下层: ['结束'] },
    { 名: '右', 类型: '硬', 下层: ['尾2'] },
    { 名: '左', 类型: '硬', 下层: ['尾1'] },
    { 名: '开始', 类型: '开始', 下层: ['左', '右'] },
  ])
  await 执行({ cmd: '自动排列', 参数: { 项目 } })

  const 图 = 读(项目)
  const 左 = 坐标(图, '左')!
  const 右 = 坐标(图, '右')!
  const 尾1 = 坐标(图, '尾1')!
  const 尾2 = 坐标(图, '尾2')!
  const 左在前 = 左[0] < 右[0]
  assert.equal(左在前 ? 尾1[0] < 尾2[0] : 尾2[0] < 尾1[0], true, '子节点顺序要跟父节点一致，否则连线交叉')
})

test('自动排列：循环向量不占格子、不写坐标', async () => {
  const 项目 = await 建项目([])
  // 直接写图：循环向量的 E0 要求「上游是选择单元 + 下游指回它」，用命令一条条建会互相卡住
  直接写图(项目, '主蓝图', {
    格式版本: 1,
    名: '主蓝图',
    开始: '开始',
    结束: '结束',
    同步性: 0,
    单元: [
      { 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: ['甲'] },
      { 名: '甲', 类型: '选择', 标签: '无', 状态: '提醒', 下层: ['循环1'] },
      { 名: '循环1', 类型: '循环向量', 标签: '无', 状态: '提醒', 下层: ['甲'] },
      { 名: '结束', 类型: '结束', 标签: '无', 状态: '提醒', 下层: ['$结束'] },
    ],
  })

  const r = await 执行({ cmd: '自动排列', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 图 = 读(项目)
  assert.equal(坐标(图, '循环1'), undefined, '循环向量是回边，不写坐标')
  assert.ok(坐标(图, '甲'), '甲要有坐标')
})

test('自动排列：蓝图里没有单元时不报错', async () => {
  const 项目 = await 建项目([])
  const r = await 执行({ cmd: '自动排列', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
})
