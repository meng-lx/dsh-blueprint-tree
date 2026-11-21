import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 算上层 } from '../src/蓝图工具.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'

隔离登记表()

async function 新项目(): Promise<string> {
  const 父 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-unit-'))
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名('单元测试') } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return (r.数据 as { 项目: string }).项目
}

function 读蓝图(项目: string): any {
  return JSON.parse(fs.readFileSync(文件(项目, '主蓝图.json'), 'utf8'))
}

test('unit.add：建一个单元，标签走默认值，状态强制「提醒」', async () => {
  const 项目 = await 新项目()
  const r = await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: { 名: '甲', 类型: '开始' } } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const b = 读蓝图(项目)
  assert.equal(b.单元.length, 1)
  assert.deepEqual(b.单元[0], { 名: '甲', 类型: '开始', 标签: '无', 状态: '提醒' })
  assert.equal(b.开始, '甲', '开始锚点应指过去')
  assert.equal(b.结束, null)
})

test('unit.add：批量建 + 上层自动回填 + 结束锚点', async () => {
  const 项目 = await 新项目()
  const r = await 执行({
    cmd: '创建单元',
    参数: {
      项目: 项目,
      单元: [
        { 名: '甲', 类型: '开始', 下层: ['乙'] },
        { 名: '乙', 类型: '硬', 下层: ['丙'] },
        { 名: '丙', 类型: '结束' },
      ],
    },
  })
  assert.equal(r.ok, true, JSON.stringify(r))

  const b = 读蓝图(项目)
  assert.deepEqual(b.单元.map((u: any) => u.名), ['甲', '乙', '丙'])
  // 「上层」不写进文件（用户 2026-11-10 定），只现算
  assert.equal(b.单元[0].上层, undefined, '文件里不该有上层')
  const 上 = 算上层(b)
  assert.deepEqual(上['乙'], ['甲'])
  assert.deepEqual(上['丙'], ['乙'])
  assert.equal(上['甲'], undefined, '开始单元没有上游')
  assert.equal(b.结束, '丙')
})

test('unit.add：传了上层也不反写对方的下层（上层只是入参）', async () => {
  const 项目 = await 新项目()
  await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: { 名: '甲', 类型: '开始' } } })
  const r = await 执行({
    cmd: '创建单元',
    参数: { 项目: 项目, 单元: { 名: '乙', 类型: '硬', 上层: ['甲'] } },
  })
  assert.equal(r.ok, true, JSON.stringify(r))

  const b = 读蓝图(项目)
  const 甲 = b.单元.find((u: any) => u.名 === '甲')
  const 乙 = b.单元.find((u: any) => u.名 === '乙')
  assert.equal(甲.下层, undefined, '不反写：甲的下层不该多出乙')
  assert.equal(乙.上层, undefined, '文件里不该有上层')
  assert.equal((算上层(b)['乙'] ?? []).length, 0, '现算也没有上游')
})

test('unit.add：批量建出没标记的环 ⇒ 直接报错，一个都不写', async () => {
  const 项目 = await 新项目()
  const r = await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['A'] },
        { 名: 'A', 类型: '选择', 下层: ['B'] },
        { 名: 'B', 类型: '硬', 下层: ['A'] },
      ],
    },
  })
  assert.equal(r.ok, false, JSON.stringify(r))
  if (!r.ok) {
    assert.equal(r.错误.类型, '校验')
    assert.match(r.错误.消息, /环/)
  }
  const b = 读蓝图(项目)
  assert.equal(b.单元.length, 0, '报错时不该写进任何新单元（三个是同一批）')
})

test('unit.add：悬空的下层会被拦（B1）', async () => {
  const 项目 = await 新项目()
  const r = await 执行({
    cmd: '创建单元',
    参数: { 项目: 项目, 单元: { 名: '甲', 类型: '硬', 上层: ['还没建的'], 下层: ['也没建的'] } },
  })
  // 用户 2026-11-14 的表里，unit.add 的 B1 = 2（拦）
  assert.equal(r.ok, false, JSON.stringify(r))
  if (!r.ok) {
    assert.equal(r.错误.类型, '校验')
    assert.match(r.错误.消息, /B1/)
  }
  assert.equal(读蓝图(项目).单元.length, 0, '报错时不该写进任何单元')
})

test('unit.add：循环向量与子蓝图都能建', async () => {
  const 项目 = await 新项目()
  const r = await 执行({
    cmd: '创建单元',
    参数: {
      项目: 项目,
      单元: [
        { 名: 'A', 类型: '选择', 下层: ['回边', 'X'] },
        { 名: '回边', 类型: '循环向量', 下层: ['O'], 功能: 'A 回 O' },
        { 名: '登录', 类型: '子蓝图', 下层: ['X'], 功能: '登录流程' },
        { 名: 'O', 类型: '硬' },
        { 名: 'X', 类型: '结束' },
      ],
    },
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  const b = 读蓝图(项目)
  assert.equal(b.单元.length, 5)
  assert.equal(b.单元.find((u: any) => u.名 === '回边').类型, '循环向量')
  assert.equal(b.单元.find((u: any) => u.名 === '登录').类型, '子蓝图')
})

test('unit.add：功能字段写进去', async () => {
  const 项目 = await 新项目()
  await 执行({
    cmd: '创建单元',
    参数: { 项目: 项目, 单元: { 名: '甲', 类型: '硬', 功能: '判断学生是否毕业' } },
  })
  const b = 读蓝图(项目)
  assert.equal(b.单元[0].功能, '判断学生是否毕业')
})

test('unit.add：重名报错', async () => {
  const 项目 = await 新项目()
  await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: { 名: '甲', 类型: '开始' } } })
  const r = await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: { 名: '甲', 类型: '硬' } } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '已存在')
})

test('unit.add：类型非法报错，且不落盘', async () => {
  const 项目 = await 新项目()
  const r = await 执行({
    cmd: '创建单元',
    参数: { 项目: 项目, 单元: { 名: '甲', 类型: '硬核' } },
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '参数')
  assert.equal(读蓝图(项目).单元.length, 0, '失败不应该写进去')
})

test('unit.add：缺名/缺类型报参数错误', async () => {
  const 项目 = await 新项目()
  const a = await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: { 类型: '硬' } } })
  assert.equal(a.ok, false)
  if (!a.ok) assert.equal(a.错误.层, undefined)

  const b = await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: { 名: '甲' } } })
  assert.equal(b.ok, false)
})

test('unit.add：不是项目目录报错', async () => {
  const 空 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-empty-'))
  const r = await 执行({ cmd: '创建单元', 参数: { 项目: 空, 单元: { 名: '甲', 类型: '开始' } } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')
})

test('unit.add：英文命令名也认', async () => {
  const 项目 = await 新项目()
  const r = await 执行({ cmd: 'unit.add', 参数: { 项目: 项目, 单元: { 名: '甲', 类型: '开始' } } })
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('unit.add：再次建开始单元会改锚点并提示', async () => {
  const 项目 = await 新项目()
  await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: { 名: '甲', 类型: '开始' } } })
  const r = await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: { 名: '甲2', 类型: '开始' } } })
  assert.equal(r.ok, true)
  if (r.ok) {
    const d = r.数据 as { 提示?: string[] }
    assert.ok(d.提示 && d.提示.length > 0, '应该提示锚点被改')
  }
  assert.equal(读蓝图(项目).开始, '甲2')
})
