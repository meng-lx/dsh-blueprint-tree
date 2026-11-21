import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'

隔离登记表()

function 临时父目录(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-'))
}

/** 建项目的返回（**没有路径** —— 用户 2026-11-10 的隔离要求） */
type 建项目数据 = {
  项目: string // 项目名
  蓝图: string // 蓝图名
  文件: string[] // 三个文件名（不是绝对路径）
}

test('project.create：英文命令建出配置 + 三个文件', async () => {
  const 父 = 临时父目录()
  const 名 = 唯一名('演示')
  const r = await 执行({ cmd: 'project.create', 参数: { 锚点: false, 路径: 父, 名 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const d = r.数据 as 建项目数据

  assert.equal(d.项目, 名)
  assert.deepEqual(d.文件, ['主蓝图.json', '主蓝图.方法.ts', '主蓝图.方法历史.ts'])
  // 返回里不该出现路径
  assert.ok(!JSON.stringify(r).includes(父), '返回里不该有绝对路径')

  for (const f of d.文件) {
    assert.ok(fs.existsSync(文件(名, f)), `${f} 应该存在`)
  }
  const json = JSON.parse(fs.readFileSync(文件(名, '主蓝图.json'), 'utf8'))
  assert.equal(json.名, '主蓝图')
  assert.equal(json.格式版本, 1)
  assert.equal(json.开始, null)
  assert.equal(json.结束, null)
  assert.deepEqual(json.单元, [])
})

test('project.create：flow.json 里能改文件名', async () => {
  const 父 = 临时父目录()
  const 名 = 唯一名('配置')
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名 } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 配置 = JSON.parse(fs.readFileSync(文件(名, 'flow.json'), 'utf8'))
  assert.equal(配置.格式版本, 1)
  assert.equal(配置.项目名, 名)
  assert.equal(配置.蓝图.默认名, '主蓝图')
  assert.equal(配置.蓝图.文件, '{名}.json')
  assert.equal(配置.方法.文件, '{名}.方法.ts')
  assert.equal(配置.方法.文件, '{名}.方法.ts')
  assert.equal(配置.方法历史.文件, '{名}.方法历史.ts')
})

test('project.create：传「文件名」也不生效（设置只在插件里写死）', async () => {
  const 父 = 临时父目录()
  const 名 = 唯一名('改名')
  const r = await 执行({
    cmd: '创建项目',
    参数: {
      锚点: false, 路径: 父,
      名,
      文件名: { 蓝图: '{名}.蓝图.json', 方法: '{名}.代码.ts', 方法历史: '{名}.旧.ts' },
    },
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  const d = r.数据 as 建项目数据
  assert.deepEqual(d.文件, ['主蓝图.json', '主蓝图.方法.ts', '主蓝图.方法历史.ts'])
})

test('project.create：中文别名多种写法都认', async () => {
  const 父 = 临时父目录()
  for (const cmd of ['新建项目', '建项目', '新项目', '初始化项目', '创建项目']) {
    const r = await 执行({ cmd, 参数: { 锚点: false, 路径: 父, 名: 唯一名('别名') } })
    assert.equal(r.ok, true, `${cmd} → ${JSON.stringify(r)}`)
  }
})

test('project.create：大小写/空格不敏感', async () => {
  const 父 = 临时父目录()
  const r = await 执行({ cmd: '  PROJECT.CREATE  ', 参数: { 锚点: false, 路径: 父, 名: 唯一名('大小写') } })
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('project.create：同一个名字建两次，第二次说目录已存在', async () => {
  const 父 = 临时父目录()
  const 名 = 唯一名('重复')
  const 一 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名 } })
  assert.equal(一.ok, true)

  const 二 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名 } })
  assert.equal(二.ok, false)
  if (!二.ok) assert.equal(二.错误.类型, '已存在')
})

test('project.create：缺参数时报参数错误', async () => {
  const r = await 执行({ cmd: '创建项目', 参数: {} })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.错误.类型, '参数')
    assert.equal(r.错误.位置, '名')
  }
})

test('未知命令', async () => {
  const r = await 执行({ cmd: '胡写的命令', 参数: {} })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '未知命令')
})

test('自定义蓝图名', async () => {
  const 父 = 临时父目录()
  const 名 = 唯一名('子图演示')
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名, 蓝图名: '子蓝图-登录' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const d = r.数据 as 建项目数据
  assert.equal(d.蓝图, '子蓝图-登录')
  assert.ok(d.文件.includes('子蓝图-登录.json'))
  assert.equal(JSON.parse(fs.readFileSync(文件(名, '子蓝图-登录.json'), 'utf8')).名, '子蓝图-登录')
})

test('project.list：只给名字，不给路径', async () => {
  const 父 = 临时父目录()
  const 名 = 唯一名('列表')
  await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名 } })

  const r = await 执行({ cmd: '列出项目', 参数: {} })
  assert.equal(r.ok, true, JSON.stringify(r))
  const d = r.数据 as { 个数: number; 项目: { 名: string; 蓝图: string }[] }
  assert.ok(d.项目.some((x) => x.名 === 名))
  assert.ok(!JSON.stringify(r).includes(父), '列表不该暴露路径')
})

test('project.create：默认自带 开始 / 结束 两个锚点，但两个不连起来', async () => {
  const 父 = 临时父目录()
  const 名 = 唯一名('锚点')
  const r = await 执行({ cmd: '创建项目', 参数: { 路径: 父, 名 } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 图 = JSON.parse(fs.readFileSync(文件(名, '主蓝图.json'), 'utf8')) as {
    开始: string | null
    结束: string | null
    单元: { 名: string; 类型: string; 下层?: string[] }[]
  }
  assert.equal(图.开始, '开始', '蓝图.开始 要指向那个开始单元')
  assert.equal(图.结束, '结束', '蓝图.结束 要指向那个结束单元')
  assert.deepEqual(
    图.单元.map((u) => [u.名, u.类型]),
    [
      ['开始', '开始'],
      ['结束', '结束'],
    ],
  )
  // 用户 m06001：「不连起来」⇒ 开始的下层是空的
  assert.equal(图.单元[0].下层, undefined, '开始不该连到结束')
  // 结束的下层是出口标记，不是连向别的单元
  assert.deepEqual(图.单元[1].下层, ['$结束'])
})

