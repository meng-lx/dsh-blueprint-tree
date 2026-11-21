import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 直接写图 } from './造图.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'

隔离登记表()

async function 建项目(): Promise<string> {
  const 父 = fs.mkdtempSync(path.join(process.env.BLUEPRINT_TREE_HOME!, 'p-'))
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名('检') } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return (r.数据 as { 项目: string }).项目
}

async function 建单元(项目: string, 单元: unknown): Promise<void> {
  const r = await 执行({ cmd: '创建单元', 参数: { 项目, 单元 } })
  assert.equal(r.ok, true, JSON.stringify(r))
}

/** 一条正常的链：开始 → 甲 → 结束 → $结束 */
async function 正常项目(): Promise<string> {
  const 项目 = await 建项目()
  await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['甲'] },
    { 名: '甲', 类型: '硬', 下层: ['结束'] },
    { 名: '结束', 类型: '结束', 下层: ['$结束'] },
  ])
  return 项目
}

function 行(r: unknown): string[] {
  return (r as { 数据?: { 行?: string[] } }).数据?.行 ?? []
}

function 有码(rs: string[], 码: string): boolean {
  return rs.some((s) => s.split('|')[1] === 码)
}

test('检测：正常的链没有问题', async () => {
  const 项目 = await 正常项目()
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(行(r), [])
})

test('检测：A2 重名', async () => {
  const 项目 = await 建项目()
  // 绕过 unit.add 的去重，直接写文件造重名
  const p = 文件(项目, '主蓝图.json')
  const 图 = JSON.parse(fs.readFileSync(p, 'utf8'))
  图.单元 = [
    { 名: '开始', 类型: '开始', 下层: ['甲'] },
    { 名: '甲', 类型: '硬', 下层: ['$结束'] },
    { 名: '甲', 类型: '硬', 下层: ['$结束'] },
  ]
  fs.writeFileSync(p, JSON.stringify(图, null, 2) + '\n', 'utf8')

  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.equal(r.ok, false)
  assert.ok(有码(行(r), 'A2'), 行(r).join('\n'))
})

test('检测：B1 悬空的下层', async () => {
  const 项目 = await 建项目()
  // 2026-11-14 起 unit.add 的 B1 是「拦」，造不出坏图 ⇒ 直接写文件
  const p = 文件(项目, '主蓝图.json')
  const 图 = JSON.parse(fs.readFileSync(p, 'utf8'))
  图.开始 = '开始'
  图.结束 = '结束'
  图.单元 = [
    { 名: '开始', 类型: '开始', 标签: '无', 状态: '正常', 下层: ['不存在'] },
    { 名: '甲', 类型: '硬', 标签: '无', 状态: '正常', 下层: ['结束'] },
    { 名: '结束', 类型: '结束', 标签: '无', 状态: '正常', 下层: ['$结束'] },
  ]
  fs.writeFileSync(p, JSON.stringify(图, null, 2) + '\n', 'utf8')
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.equal(r.ok, false)
  assert.ok(有码(行(r), 'B1'), 行(r).join('\n'))
})

test('检测：B2 连自己', async () => {
  const 项目 = await 建项目()
  const p = 文件(项目, '主蓝图.json')
  const 图 = JSON.parse(fs.readFileSync(p, 'utf8'))
  图.单元 = [
    { 名: '开始', 类型: '开始', 下层: ['开始'] },
    { 名: '甲', 类型: '硬', 下层: ['$结束'] },
  ]
  fs.writeFileSync(p, JSON.stringify(图, null, 2) + '\n', 'utf8')
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.ok(有码(行(r), 'B2'), 行(r).join('\n'))
})

test('检测：B0 文件里带着上层（警告）', async () => {
  const 项目 = await 建项目()
  const p = 文件(项目, '主蓝图.json')
  const 图 = JSON.parse(fs.readFileSync(p, 'utf8'))
  图.单元 = [
    { 名: '开始', 类型: '开始', 下层: ['甲'] },
    { 名: '甲', 类型: '硬', 上层: ['开始'], 下层: ['$结束'] },
  ]
  fs.writeFileSync(p, JSON.stringify(图, null, 2) + '\n', 'utf8')
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.ok(有码(行(r), 'B0'), 行(r).join('\n'))
})

test('检测：C1 没有开始类型单元', async () => {
  const 项目 = await 建项目()
  const p = 文件(项目, '主蓝图.json')
  const 图 = JSON.parse(fs.readFileSync(p, 'utf8'))
  图.单元 = [{ 名: '甲', 类型: '硬', 下层: ['$结束'] }]
  图.开始 = null
  fs.writeFileSync(p, JSON.stringify(图, null, 2) + '\n', 'utf8')
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.ok(有码(行(r), 'C1'), 行(r).join('\n'))
})

test('检测：C5 走不到的单元', async () => {
  const 项目 = await 建项目()
  await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['甲'] },
    { 名: '甲', 类型: '硬', 下层: ['$结束'] },
    { 名: '孤儿', 类型: '硬', 下层: ['$结束'] },
  ])
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.ok(有码(行(r), 'C5'), 行(r).join('\n'))
})

test('检测：C6 走不到出口', async () => {
  const 项目 = await 建项目()
  const p = 文件(项目, '主蓝图.json')
  const 图 = JSON.parse(fs.readFileSync(p, 'utf8'))
  图.单元 = [
    { 名: '开始', 类型: '开始', 下层: ['甲'] },
    { 名: '甲', 类型: '硬', 下层: ['甲'] },
  ]
  fs.writeFileSync(p, JSON.stringify(图, null, 2) + '\n', 'utf8')
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.ok(有码(行(r), 'C6'), 行(r).join('\n'))
})

test('检测：F1 子蓝图缺文件', async () => {
  const 项目 = await 建项目()
  await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['登录'] },
    { 名: '登录', 类型: '子蓝图', 下层: ['$结束'] },
  ])
  // 把生成的子蓝图文件删掉
  fs.rmSync(文件(项目, '登录.json'), { force: true })
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.ok(有码(行(r), 'F1'), 行(r).join('\n'))
})

test('检测：H1 单元数超过上限', async () => {
  const 项目 = await 建项目()
  // 默认 限制.单元数 = 0（不限），这里显式压到 3 再验 H1 会拦
  const 配置文件 = 文件(项目, 'flow.json')
  const 配置 = JSON.parse(fs.readFileSync(配置文件, 'utf8'))
  配置.限制.单元数 = 3
  fs.writeFileSync(配置文件, JSON.stringify(配置, null, 2) + '\n', 'utf8')
  const 单元们 = [{ 名: '开始', 类型: '开始', 下层: ['u1'] }]
  for (let i = 1; i <= 7; i++) {
    单元们.push({ 名: `u${i}`, 类型: '硬', 下层: i === 7 ? ['$结束'] : [`u${i + 1}`] })
  }
  // 开始 + 7 个 = 8 个 > 3
  // 2026-11-14 起 `创建单元` 会拦 H1 ⇒ 直接写文件造
  直接写图(项目, '主蓝图', { 开始: '开始', 单元: 单元们 })
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.ok(有码(行(r), 'H1'), 行(r).join('\n'))
})

test('检测：限制.单元数 = 0 时不拦个数', async () => {
  const 项目 = await 建项目()
  const 单元们 = [{ 名: '开始', 类型: '开始', 下层: ['u1'] }]
  for (let i = 1; i <= 7; i++) {
    单元们.push({ 名: `u${i}`, 类型: '硬', 下层: i === 7 ? ['$结束'] : [`u${i + 1}`] })
  }
  直接写图(项目, '主蓝图', { 开始: '开始', 单元: 单元们 })
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.equal(有码(行(r), 'H1'), false, 行(r).join('\n'))
})

test('检测：缺方法不算错', async () => {
  const 项目 = await 正常项目()
  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('检测：G3 方法最后一行不是 return', async () => {
  const 项目 = await 正常项目()

  const p = 文件(项目, '主蓝图.方法.ts')
  const 源 = fs.readFileSync(p, 'utf8').replace('return {};', 'let x = 1;')
  fs.writeFileSync(p, 源, 'utf8')

  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目 } })
  assert.ok(有码(行(r), 'G3'), 行(r).join('\n'))
})

test('检测：范围可以只跑一组', async () => {
  const 项目 = await 建项目()
  const p = 文件(项目, '主蓝图.json')
  const 图 = JSON.parse(fs.readFileSync(p, 'utf8'))
  图.单元 = [{ 名: '甲', 类型: '硬', 下层: ['$结束'] }]
  图.开始 = null
  fs.writeFileSync(p, JSON.stringify(图, null, 2) + '\n', 'utf8')

  const r = await 执行({ cmd: '检测蓝图', 参数: { 项目, 范围: 'A' } })
  assert.equal(r.ok, true, '只查 A 组，A 组没问题就该过')
})
