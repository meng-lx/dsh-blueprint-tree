import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 算上层 } from '../src/蓝图工具.ts'
import { 隔离登记表, 唯一名, 文件, 目录 } from './工具.ts'

隔离登记表()

function 临时父目录(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-del-'))
}

async function 建项目(名: string): Promise<string> {
  const 父 = 临时父目录()
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名(名) } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return (r.数据 as { 项目: string }).项目
}

type 建单元返回 = { 蓝图: string; 新增: string[]; 总单元数: number; 子蓝图文件?: string[] }

async function 建单元(项目: string, 单元: unknown, 蓝图?: string): Promise<建单元返回> {
  const r = await 执行({ cmd: '创建单元', 参数: { 项目: 项目, ...(蓝图 ? { 蓝图 } : {}), 单元 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return r.数据 as 建单元返回
}

function 读蓝图(项目: string, 蓝图名 = '主蓝图'): any {
  return JSON.parse(fs.readFileSync(文件(项目, `${蓝图名}.json`), 'utf8'))
}

// ═══════════════════ 删项目 ═══════════════════

test('删项目：正常删掉整个目录', async () => {
  const 项目 = await 建项目('要删的')
  const 地 = 目录(项目)
  assert.ok(fs.existsSync(地))

  const r = await 执行({ cmd: '删除项目', 参数: { 项目: 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(fs.existsSync(地), false)
})

test('删项目：不是项目目录 ⇒ 拒绝，别的目录原样留着', async () => {
  const 普通目录 = 临时父目录()
  fs.writeFileSync(path.join(普通目录, '随便.txt'), 'x', 'utf8')

  const r = await 执行({ cmd: '删除项目', 参数: { 项目: 普通目录 } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')

  // 关键：目录和里面的文件都还在
  assert.ok(fs.existsSync(普通目录))
  assert.ok(fs.existsSync(path.join(普通目录, '随便.txt')))
})

test('删项目：路径不存在时报错', async () => {
  const 不存在 = path.join(os.tmpdir(), 'blueprint-tree-这个肯定没有-' + Date.now())
  const r = await 执行({ cmd: '删除项目', 参数: { 项目: 不存在 } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')
})

test('删项目：缺路径时报参数错误', async () => {
  const r = await 执行({ cmd: '删除项目', 参数: {} })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.位置, '项目')
})

// ═══════════════════ 删单元 ═══════════════════

test('删单元：按名字删，连线一起清掉', async () => {
  const 项目 = await 建项目('删单元演示')
  await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['甲', '乙'] },
    { 名: '甲', 类型: '硬', 下层: ['结束'] },
    { 名: '乙', 类型: '硬', 下层: ['结束'] },
    { 名: '结束', 类型: '结束' },
  ])

  const r = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 单元: '甲' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const 数据 = r.数据 as { 删除: string[]; 总单元数: number; 断开的下层: string[] }
  assert.deepEqual(数据.删除, ['甲'])
  assert.equal(数据.总单元数, 3)
  assert.ok(数据.断开的下层.includes('开始'), '开始的下层里应该断掉甲')

  const 图 = 读蓝图(项目)
  assert.equal(图.单元.some((u: any) => u.名 === '甲'), false)
  // 开始的下层只剩乙；结束的上层只剩乙
  const 开始 = 图.单元.find((u: any) => u.名 === '开始')
  assert.deepEqual(开始.下层, ['乙'])
  // 「上层」现算，文件里没有
  assert.deepEqual(算上层(图)['结束'], ['乙'])
})

test('删单元：开始 / 结束 单元不能删', async () => {
  const 项目 = await 建项目('删锚点')
  await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['结束'] },
    { 名: '结束', 类型: '结束' },
  ])
  assert.equal(读蓝图(项目).开始, '开始')

  const r = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 单元: '开始' } })
  assert.equal(r.ok, false, JSON.stringify(r))
  if (!r.ok) {
    assert.equal(r.错误.类型, '校验')
    assert.match(r.错误.消息, /开始 \/ 结束/)
  }
  // 一个都没删掉
  assert.equal(读蓝图(项目).单元.length, 2)
  assert.equal(读蓝图(项目).开始, '开始')
})

test('删单元：删子蓝图时把它的 .json 一起删掉', async () => {
  const 项目 = await 建项目('删子蓝图')
  const 建 = await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['登录流程'] },
    { 名: '登录流程', 类型: '子蓝图', 下层: ['结束'] },
    { 名: '结束', 类型: '结束' },
  ])
  const 子文件 = 文件(项目, 建.子蓝图文件![0])
  assert.ok(fs.existsSync(子文件))

  const r = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 单元: '登录流程' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(fs.existsSync(子文件), false, '子蓝图 json 应该一起被删')
  assert.equal(读蓝图(项目).单元.some((u: any) => u.名 === '登录流程'), false)
})

test('删单元：名字不存在 ⇒ 报错，文件一个字节都不改', async () => {
  const 项目 = await 建项目('删不存在的')
  await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['结束'] },
    { 名: '结束', 类型: '结束' },
  ])
  const 前 = fs.readFileSync(文件(项目, '主蓝图.json'), 'utf8')

  const r = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 单元: '不存在' } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')

  assert.equal(fs.readFileSync(文件(项目, '主蓝图.json'), 'utf8'), 前)
})

test('删单元：一次删多个，含一个不存在时整体不动', async () => {
  const 项目 = await 建项目('批量删')
  await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['甲', '乙'] },
    { 名: '甲', 类型: '硬' },
    { 名: '乙', 类型: '硬' },
  ])
  const 前 = fs.readFileSync(文件(项目, '主蓝图.json'), 'utf8')

  const 坏 = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 单元: ['甲', '丙'] } })
  assert.equal(坏.ok, false)
  assert.equal(fs.readFileSync(文件(项目, '主蓝图.json'), 'utf8'), 前)

  const 好 = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 单元: ['甲', '乙'] } })
  assert.equal(好.ok, true, JSON.stringify(好))
  assert.equal((好.数据 as { 总单元数: number }).总单元数, 1)
})

test('删单元：缺「单元」参数时报错', async () => {
  const 项目 = await 建项目('缺参数删')
  const r = await 执行({ cmd: '删除单元', 参数: { 项目: 项目 } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.位置, '单元')
})

test('删单元：嵌套的子蓝图会递归删到底', async () => {
  const 项目 = await 建项目('嵌套删')
  const 一 = await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['登录流程'] },
    { 名: '登录流程', 类型: '子蓝图', 下层: ['结束'] },
    { 名: '结束', 类型: '结束' },
  ])
  // 在「登录流程」这张子图里，再放一个子蓝图单元「验证码」⇒ 生成 验证码.json
  const 二 = await 建单元(项目, [{ 名: '验证码', 类型: '子蓝图' }], '登录流程')

  const 登录文件 = 文件(项目, 一.子蓝图文件![0])
  const 验证码文件 = 文件(项目, 二.子蓝图文件![0])
  assert.ok(fs.existsSync(登录文件))
  assert.ok(fs.existsSync(验证码文件))

  const r = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 单元: '登录流程' } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 删掉 = (r.数据 as { 删掉的文件: string[] }).删掉的文件
  assert.equal(fs.existsSync(登录文件), false, '登录流程.json 应该被删')
  assert.equal(fs.existsSync(验证码文件), false, '验证码.json 是下级的，也要递归删掉')
  assert.ok(删掉.some((p) => p.endsWith('登录流程.json')))
  assert.ok(删掉.some((p) => p.endsWith('验证码.json')))
})

test('删单元：子蓝图互相指也不会转死', async () => {
  const 项目 = await 建项目('环引用')
  await 建单元(项目, [{ 名: '甲', 类型: '子蓝图' }])
  // 甲 的图里放一个子蓝图单元「乙」；再把 乙 的图里放一个「甲」…
  // 但「甲.json」已存在，建「乙」时不会重写甲，所以这里手工造一个环：
  const 甲文件 = 文件(项目, '甲.json')
  const 甲图 = JSON.parse(fs.readFileSync(甲文件, 'utf8'))
  甲图.单元 = [{ 名: '乙', 类型: '子蓝图', 标签: '无', 状态: '正常' }]
  fs.writeFileSync(甲文件, JSON.stringify(甲图, null, 2) + '\n', 'utf8')

  const 乙文件 = 文件(项目, '乙.json')
  fs.writeFileSync(
    乙文件,
    JSON.stringify(
      { 格式版本: 1, 名: '乙', 开始: null, 结束: null, 单元: [{ 名: '甲', 类型: '子蓝图', 标签: '无', 状态: '正常' }] },
      null,
      2,
    ) + '\n',
    'utf8',
  )

  const r = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 单元: '甲' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(fs.existsSync(甲文件), false)
  assert.equal(fs.existsSync(乙文件), false)
})

test('删单元：指定子蓝图时，删的是子图里的单元，子图文件不删', async () => {
  const 项目 = await 建项目('删子图里的单元')
  const 建 = await 建单元(项目, [
    { 名: '开始', 类型: '开始', 下层: ['登录流程'] },
    { 名: '登录流程', 类型: '子蓝图' },
  ])
  const 子文件 = 文件(项目, 建.子蓝图文件![0])

  // 子图里加一个普通单元，删它（预置的 -单元1 是入口，受保护不能删）
  await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 蓝图: '登录流程', 单元: { 名: '甲', 类型: '硬' } } })

  const r = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 蓝图: '登录流程', 单元: '甲' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.ok(fs.existsSync(子文件), '删的是子图里的单元，子图文件本身不能删')
  assert.equal(读蓝图(项目, '登录流程').单元.length, 1)
})
