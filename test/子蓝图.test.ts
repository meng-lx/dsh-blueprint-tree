import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'

隔离登记表()

async function 建项目(名 = '子蓝图演示'): Promise<{ 项目: string; 蓝图: string }> {
  const 父 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-sub-'))
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名(名) } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return r.数据 as { 项目: string; 蓝图: string }
}

test('建子蓝图单元时同步生成同名 .json', async () => {
  const d = await 建项目()
  const r = await 执行({
    cmd: '创建单元',
    参数: {
      项目: d.项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['登录'] },
        { 名: '登录', 类型: '子蓝图', 下层: ['$结束'] },
      ],
    },
  })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 子文件 = 文件(d.项目, '登录.json')
  assert.ok(fs.existsSync(子文件), '子蓝图文件应该被生成')

  const 子 = JSON.parse(fs.readFileSync(子文件, 'utf8'))
  assert.equal(子.名, '登录')
  // 新建子图直接把入口指向预置格子（它下层是 $结束，所以同时是出口）
  assert.equal(子.开始, '登录-单元1')
  assert.equal(子.结束, null)

  // 子蓝图里预置一个入口格子：<子蓝图名>-单元1，类型软、下层直接是 $结束
  assert.equal(子.单元.length, 1)
  assert.equal(子.单元[0].名, '登录-单元1')
  assert.equal(子.单元[0].类型, '软')
  assert.equal(子.单元[0].标签, '无')
  assert.equal(子.单元[0].状态, '提醒')
  // 不照抄父图的下层 —— 父图的单元名在子图里不存在，直接写出口标记
  assert.deepEqual(子.单元[0].下层, ['$结束'])

  // 主蓝图里那个单元还在
  const 主 = JSON.parse(fs.readFileSync(文件(d.项目, '主蓝图.json'), 'utf8'))
  assert.ok(主.单元.some((u: { 名: string }) => u.名 === '登录'))
})

test('子蓝图文件已存在时直接报错拒绝，不写盘', async () => {
  const d = await 建项目('已存在')
  const 子文件 = 文件(d.项目, '订单.json')
  fs.writeFileSync(子文件, '{"标记":"原有内容"}', 'utf8')
  const 蓝图文件 = 文件(d.项目, '主蓝图.json')
  const 改前 = fs.readFileSync(蓝图文件, 'utf8')

  const r = await 执行({
    cmd: '创建单元',
    参数: { 项目: d.项目, 单元: { 名: '订单', 类型: '子蓝图' } },
  })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.错误.类型, '校验')
    assert.equal(r.错误.位置, '订单')
  }

  // 蓝图一个字节没动，子图文件也没被覆盖
  assert.equal(fs.readFileSync(蓝图文件, 'utf8'), 改前)
  assert.equal(fs.readFileSync(子文件, 'utf8'), '{"标记":"原有内容"}')
})

test('可以往子蓝图里加单元（蓝图参数）', async () => {
  const d = await 建项目('子图加单元')
  await 执行({
    cmd: '创建单元',
    参数: { 项目: d.项目, 单元: { 名: '登录', 类型: '子蓝图' } },
  })

  const r = await 执行({
    cmd: '创建单元',
    参数: {
      项目: d.项目,
      蓝图: '登录',
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['收'] },
        { 名: '收', 类型: '结束' },
      ],
    },
  })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 子 = JSON.parse(fs.readFileSync(文件(d.项目, '登录.json'), 'utf8'))
  assert.equal(子.名, '登录')
  assert.equal(子.开始, '开始')
  assert.equal(子.结束, '收')
  // 预置的「登录」硬单元 + 新建的「开始」「收」
  assert.equal(子.单元.length, 3)
  assert.ok(子.单元.some((u: { 名: string }) => u.名 === '登录-单元1'))

  // 主蓝图没被污染
  const 主 = JSON.parse(fs.readFileSync(文件(d.项目, '主蓝图.json'), 'utf8'))
  assert.equal(主.单元.length, 1)
})

test('蓝图参数也接受带 .json 的文件名', async () => {
  const d = await 建项目('带后缀')
  await 执行({
    cmd: '创建单元',
    参数: { 项目: d.项目, 单元: { 名: '甲', 类型: '子蓝图' } },
  })

  const r = await 执行({
    cmd: '创建单元',
    参数: { 项目: d.项目, 蓝图: '甲.json', 单元: { 名: '节点', 类型: '软' } },
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.ok(!fs.existsSync(文件(d.项目, '甲.json.json')), '不该生成双后缀文件')
})

test('蓝图不存在时报错', async () => {
  const d = await 建项目('蓝图不存在')
  const r = await 执行({
    cmd: '创建单元',
    参数: { 项目: d.项目, 蓝图: '查无此图', 单元: { 名: '甲', 类型: '软' } },
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')
})
