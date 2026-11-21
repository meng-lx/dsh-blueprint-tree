import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'

隔离登记表()

function 临时父目录(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-bt-'))
}

type 建好的 = { 项目: string }

/** 主蓝图：开始 → 甲 → 乙 → 丙 → 结束（一条纯链） */
async function 建直链(): Promise<建好的> {
  const 父 = 临时父目录()
  const 一 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名('直链') } })
  assert.equal(一.ok, true, JSON.stringify(一))
  const 项目 = (一.数据 as { 项目: string }).项目
  const 二 = await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲'] },
        { 名: '甲', 类型: '硬', 下层: ['乙'] },
        { 名: '乙', 类型: '硬', 下层: ['丙'] },
        { 名: '丙', 类型: '硬', 下层: ['结束'] },
        { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      ],
    },
  })
  assert.equal(二.ok, true, JSON.stringify(二))
  return { 项目 }
}

test('直链：甲支配丙，关系是「支配」，之间是 [乙]', async () => {
  const { 项目 } = await 建直链()
  const r = await 执行({ cmd: '查两单元', 参数: { 项目, 上游单元: '甲', 下游单元: '丙' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const d = r.数据 as any
  assert.equal(d.关系, '支配')
  assert.equal(d.有通路, true)
  assert.deepEqual(d.之间, ['乙'])
  assert.equal(d.含多上游软单元, false)
  assert.equal(d.含选择单元, false)
})

test('反着问：丙「被支配」', async () => {
  const { 项目 } = await 建直链()
  const r = await 执行({ cmd: '查两单元', 参数: { 项目, 上游单元: '丙', 下游单元: '甲' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const d = r.数据 as any
  assert.equal(d.关系, '没有通路')
  assert.equal(d.有通路, false)
})

test('跨不过去：乙 → 开始 没有通路', async () => {
  const { 项目 } = await 建直链()
  const r = await 执行({ cmd: '查两单元', 参数: { 项目, 上游单元: '乙', 下游单元: '开始' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal((r.数据 as any).关系, '没有通路')
})

test('汇合点：两条路都经过「汇总」⇒ 甲支配汇总、乙支配汇总；甲和乙之间无关', async () => {
  const 父 = 临时父目录()
  const 一 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名('汇合') } })
  const 项目 = (一.数据 as { 项目: string }).项目
  await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲', '乙'] },
        { 名: '甲', 类型: '硬', 下层: ['汇总'] },
        { 名: '乙', 类型: '硬', 下层: ['汇总'] },
        { 名: '汇总', 类型: '硬', 下层: ['结束'] },
        { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      ],
    },
  })

  const r = await 执行({ cmd: '查两单元', 参数: { 项目, 上游单元: '甲', 下游单元: '汇总' } })
  const d = r.数据 as any
  // 甲到汇总只有一条路，中间没有东西；但开始也能到汇总，所以甲不支配汇总
  assert.equal(d.有通路, true)
  assert.deepEqual(d.之间, [])
  assert.equal(d.关系, '无关')

  const r2 = await 执行({ cmd: '查两单元', 参数: { 项目, 上游单元: '开始', 下游单元: '结束' } })
  assert.equal((r2.数据 as any).关系, '支配')
})

test('中间有多上游软单元和选择单元', async () => {
  const 父 = 临时父目录()
  const 一 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名('脏链') } })
  const 项目 = (一.数据 as { 项目: string }).项目
  await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲'] },
        { 名: '甲', 类型: '硬', 下层: ['软汇'] },
        { 名: '旁路', 类型: '硬', 下层: ['软汇'] },
        { 名: '软汇', 类型: '软', 下层: ['选'] },
        { 名: '选', 类型: '选择', 下层: ['结束'] },
        { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      ],
    },
  })

  const r = await 执行({ cmd: '查两单元', 参数: { 项目, 上游单元: '甲', 下游单元: '结束' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const d = r.数据 as any
  assert.equal(d.含多上游软单元, true)
  assert.deepEqual(d.多上游软单元, ['软汇'])
  assert.equal(d.含选择单元, true)
  assert.deepEqual(d.选择单元, ['选'])
})

test('中间有子蓝图', async () => {
  const 父 = 临时父目录()
  const 一 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名('带子图') } })
  const 项目 = (一.数据 as { 项目: string }).项目
  await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲'] },
        { 名: '甲', 类型: '硬', 下层: ['登录'] },
        { 名: '登录', 类型: '子蓝图', 下层: ['结束'] },
        { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      ],
    },
  })

  const r = await 执行({ cmd: '查两单元', 参数: { 项目, 上游单元: '甲', 下游单元: '结束' } })
  const d = r.数据 as any
  assert.deepEqual(d.子蓝图, ['登录'])
})

test('子蓝图：两个单元都留空 ⇒ 默认入口和出口', async () => {
  const 父 = 临时父目录()
  const 一 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名('子图') } })
  const 项目 = (一.数据 as { 项目: string }).项目
  // 主蓝图里放一个子蓝图单元，会顺带生成 登录.json
  await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['登录'] },
        { 名: '登录', 类型: '子蓝图', 下层: ['结束'] },
        { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      ],
    },
  })
  // 子图里补成一条链：A → B，入口 A，出口 B
  await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      蓝图: '登录',
      单元: [
        { 名: 'A', 类型: '硬', 下层: ['B'] },
        { 名: 'B', 类型: '硬', 下层: ['$结束'] },
      ],
    },
  })
  // 预置的「登录-单元1」是入口，不能删 ⇒ 先把入口改成 A，再删它
  const 图文件 = 文件(项目, '登录.json')
  const 图 = JSON.parse(fs.readFileSync(图文件, 'utf8'))
  图.开始 = 'A'
  fs.writeFileSync(图文件, JSON.stringify(图, null, 2) + '\n', 'utf8')
  await 执行({ cmd: '删除单元', 参数: { 项目, 蓝图: '登录', 单元: '登录-单元1' } })

  const r = await 执行({ cmd: '查两单元', 参数: { 项目, 蓝图: '登录' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const d = r.数据 as any
  assert.equal(d.开始单元, 'A')
  assert.equal(d.结束单元, 'B')
  assert.equal(d.关系, '支配')
})

test('主蓝图不给单元时报参数错', async () => {
  const { 项目 } = await 建直链()
  const r = await 执行({ cmd: '查两单元', 参数: { 项目 } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.位置, '上游单元')
})

test('单元不存在', async () => {
  const { 项目 } = await 建直链()
  const r = await 执行({ cmd: '查两单元', 参数: { 项目, 上游单元: '查无此单元', 下游单元: '甲' } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')
})
