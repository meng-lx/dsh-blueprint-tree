import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'

隔离登记表()

async function 新项目(名 = '状态演示'): Promise<string> {
  const 父 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-st-'))
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名(名) } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return (r.数据 as { 项目: string }).项目
}

function 读蓝图(项目: string): any {
  return JSON.parse(fs.readFileSync(文件(项目, '主蓝图.json'), 'utf8'))
}

test('创建时状态强制是「提醒」，传了「正常」也不生效', async () => {
  const 项目 = await 新项目()
  const r = await 执行({
    cmd: '创建单元',
    参数: { 项目: 项目, 单元: [{ 名: '甲', 类型: '硬', 状态: '正常' }] },
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  const 提示 = (r.数据 as { 提示?: string[] }).提示 ?? []
  assert.ok(提示.some((s) => s.includes('创建时状态固定是「提醒」')), JSON.stringify(提示))
  assert.equal(读蓝图(项目).单元[0].状态, '提醒')
})

test('unit.status：改一个单元的状态', async () => {
  const 项目 = await 新项目()
  await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: [{ 名: '甲', 类型: '硬' }] } })

  const r = await 执行({ cmd: '修改状态', 参数: { 项目: 项目, 单元: '甲', 状态: '正常' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const d = r.数据 as { 已改: { 名: string; 原状态: string; 新状态: string }[] }
  assert.deepEqual(d.已改, [{ 名: '甲', 原状态: '提醒', 新状态: '正常' }])
  assert.equal(读蓝图(项目).单元[0].状态, '正常')
})

test('unit.status：一次改多个', async () => {
  const 项目 = await 新项目()
  await 执行({
    cmd: '创建单元',
    参数: {
      项目: 项目,
      单元: [
        { 名: '甲', 类型: '硬' },
        { 名: '乙', 类型: '硬' },
        { 名: '丙', 类型: '硬' },
      ],
    },
  })
  const r = await 执行({ cmd: '单元状态', 参数: { 项目: 项目, 单元: ['甲', '乙'], 状态: '废弃' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const b = 读蓝图(项目)
  assert.equal(b.单元[0].状态, '废弃')
  assert.equal(b.单元[1].状态, '废弃')
  assert.equal(b.单元[2].状态, '提醒')
})

test('unit.status：名字不存在时整体不动', async () => {
  const 项目 = await 新项目()
  await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: [{ 名: '甲', 类型: '硬' }] } })
  const r = await 执行({ cmd: '修改状态', 参数: { 项目: 项目, 单元: ['甲', '不存在'], 状态: '正常' } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')
  assert.equal(读蓝图(项目).单元[0].状态, '提醒', '整体不动')
})

test('unit.status：状态值不认时报参数错误', async () => {
  const 项目 = await 新项目()
  await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: [{ 名: '甲', 类型: '硬' }] } })
  const r = await 执行({ cmd: '修改状态', 参数: { 项目: 项目, 单元: '甲', 状态: '瞎写' } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.位置, '状态')
})

test('unit.status：本来就是这个状态，已改为空', async () => {
  const 项目 = await 新项目()
  await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: [{ 名: '甲', 类型: '硬' }] } })
  const r = await 执行({ cmd: '修改状态', 参数: { 项目: 项目, 单元: '甲', 状态: '提醒' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual((r.数据 as { 已改: unknown[] }).已改, [])
})
