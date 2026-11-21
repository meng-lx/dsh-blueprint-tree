import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 算上层 } from '../src/蓝图工具.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'

隔离登记表()

function 临时父目录(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-up-'))
}

type 演示 = { 父: string; 项目: string; 蓝图: string }

async function 建演示(): Promise<演示> {
  const 父 = 临时父目录()
  const 一 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名('演示') } })
  assert.equal(一.ok, true, JSON.stringify(一))
  const 项目 = (一.数据 as { 项目: string }).项目
  const 二 = await 执行({
    cmd: '创建单元',
    参数: {
      项目: 项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲'] },
        { 名: '甲', 类型: '硬', 下层: ['结束'], 功能: '原说明' },
        { 名: '结束', 类型: '结束', 上层: ['甲'] },
      ],
    },
  })
  assert.equal(二.ok, true, JSON.stringify(二))
  return { 父, 项目, 蓝图: 文件(项目, '主蓝图.json') }
}

function 读(文件: string): any {
  return JSON.parse(fs.readFileSync(文件, 'utf8'))
}

function 找(图: any, 名: string): any {
  return 图.单元.find((u: any) => u.名 === 名)
}

test('改功能、标签、坐标', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const r = await 执行({
    cmd: '修改单元',
    参数: { 项目: 项目, 单元: '甲', 改: { 功能: '新说明', 标签: '强制', 坐标: [120, 200] } },
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  const u = 找(读(蓝图), '甲')
  assert.equal(u.功能, '新说明')
  assert.equal(u.标签, '强制')
  assert.deepEqual(u.坐标, [120, 200])
})

test('改类型：硬 → 软', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '甲', 改: { 类型: '软' } } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(找(读(蓝图), '甲').类型, '软')
})

test('类型不能改成 开始/结束/循环向量/子蓝图', async () => {
  for (const 坏 of ['开始', '结束', '循环向量', '子蓝图']) {
    const { 项目, 蓝图 } = await 建演示()
    const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '甲', 改: { 类型: 坏 } } })
    assert.equal(r.ok, false, `改成「${坏}」应该被拒`)
    assert.equal(找(读(蓝图), '甲').类型, '硬', '拒了就不该动磁盘')
  }
})

test('开始 / 结束 / 子蓝图 单元不能改类型', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '开始', 改: { 类型: '硬' } } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '校验')
  assert.equal(找(读(蓝图), '开始').类型, '开始')

  const 子 = await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: [{ 名: '登录', 类型: '子蓝图' }] } })
  assert.equal(子.ok, true, JSON.stringify(子))
  const r2 = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '登录', 改: { 类型: '硬' } } })
  assert.equal(r2.ok, false)
})

test('改名：别人的下层、锚点、上层全跟着变', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '甲', 改: { 名: '甲路' } } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 图 = 读(蓝图)
  assert.deepEqual(找(图, '开始').下层, ['甲路'])
  const 上 = 算上层(图)
  assert.deepEqual(上['甲路'], ['开始'])
  assert.deepEqual(上['结束'], ['甲路'])
  assert.equal(找(图, '甲'), undefined)
})

test('改名：锚点跟着变', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '开始', 改: { 名: '入口' } } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 图 = 读(蓝图)
  assert.equal(图.开始, '入口')
  const 数据 = r.数据 as any
  assert.deepEqual(数据.改名连带.锚点, ['开始'])
})

test('改名：子蓝图的 .json 一起改名（不递归）', async () => {
  const 父 = 临时父目录()
  const 一 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名('演示') } })
  const 项目 = (一.数据 as { 项目: string }).项目
  const 建 = await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: [{ 名: '登录', 类型: '子蓝图' }] } })
  assert.equal(建.ok, true, JSON.stringify(建))
  assert.ok(fs.existsSync(文件(项目, '登录.json')))

  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '登录', 改: { 名: '登录流程' } } })
  assert.equal(r.ok, true, JSON.stringify(r))

  assert.equal(fs.existsSync(文件(项目, '登录.json')), false, '旧文件应该没了')
  assert.ok(fs.existsSync(文件(项目, '登录流程.json')), '新文件应该在')
  const 数据 = r.数据 as any
  assert.ok(数据.改名连带.文件.endsWith('登录流程.json'))
})

test('改下层：上层重算', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '开始', 改: { 下层: ['甲', '结束'] } } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 图 = 读(蓝图)
  assert.deepEqual(找(图, '开始').下层, ['甲', '结束'])
  assert.deepEqual(算上层(图)['结束'], ['开始', '甲'])
})

test('改下层：清空', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '甲', 改: { 下层: [] } } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const 图 = 读(蓝图)
  assert.equal(找(图, '甲').下层, undefined)
  assert.equal(算上层(图)['结束'], undefined)
})

test('试运行：只算不写', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const 前 = fs.readFileSync(蓝图, 'utf8')
  const r = await 执行({
    cmd: '修改单元',
    参数: { 项目: 项目, 单元: '甲', 改: { 名: '甲路' }, 试运行: true },
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(fs.readFileSync(蓝图, 'utf8'), 前, '试运行不该动文件')
  const 数据 = r.数据 as any
  assert.equal(数据.试运行, true)
  assert.deepEqual(数据.改了, ['名'])
})

test('单元不存在', async () => {
  const { 项目 } = await 建演示()
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '没有这个', 改: { 功能: 'x' } } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')
})

test('什么都没变', async () => {
  const { 项目 } = await 建演示()
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '甲', 改: { 功能: '原说明' } } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual((r.数据 as any).改了, [])
})

test('缺参数', async () => {
  const r = await 执行({ cmd: '修改单元', 参数: {} })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.位置, '项目')

  const { 项目 } = await 建演示()
  const r2 = await 执行({ cmd: '修改单元', 参数: { 项目: 项目 } })
  assert.equal(r2.ok, false)
  if (!r2.ok) assert.equal(r2.错误.位置, '单元')
})

test('键值扁平写法（不用 改 对象）', async () => {
  const { 项目, 蓝图 } = await 建演示()
  // 键值模式下：单元=旧名，名=新名
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '甲', 名: '甲路', 类型: '软' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const u = 找(读(蓝图), '甲路')
  assert.equal(u.类型, '软')
})

test('英文命令名', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const r = await 执行({ cmd: 'unit.update', 参数: { 项目: 项目, 单元: '甲', 改: { 标签: '广播' } } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(找(读(蓝图), '甲').标签, '广播')
})

test('「改」也能收 JSON 字符串（键值写法躲不开）', async () => {
  const { 项目, 蓝图 } = await 建演示()
  const r = await 执行({
    cmd: '修改单元',
    参数: { 项目: 项目, 单元: '甲', 改: '{"标签":"广播","下层":["结束"]}' },
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  const u = 找(读(蓝图), '甲')
  assert.equal(u.标签, '广播')
  assert.deepEqual(u.下层, ['结束'])
})

test('「改」是坏 JSON 时报参数错', async () => {
  const { 项目 } = await 建演示()
  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '甲', 改: '{标签:' } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.位置, '改')
})

test('改名连带改方法键（当前 + 历史）', async () => {
  const { 项目 } = await 建演示()

  // 先建方法，再创建一次把旧版挤进历史
  await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲', 方法: 'return {};' } })
  await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲', 方法: 'return {};' } })

  const 当前 = 文件(项目, '主蓝图.方法.ts')
  const 历史 = 文件(项目, '主蓝图.方法历史.ts')
  assert.ok(fs.readFileSync(当前, 'utf8').includes('"甲"'), '改之前当前文件里有 甲')
  assert.ok(fs.readFileSync(历史, 'utf8').includes('"甲#'), '改之前历史里有 甲#时间戳')

  const r = await 执行({ cmd: '修改单元', 参数: { 项目: 项目, 单元: '甲', 名: '甲路' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual((r.数据 as { 改名连带: { 方法: string[] } }).改名连带.方法.sort(), [
    '主蓝图.方法.ts',
    '主蓝图.方法历史.ts',
  ])

  const 当前文 = fs.readFileSync(当前, 'utf8')
  const 历史文 = fs.readFileSync(历史, 'utf8')
  assert.ok(当前文.includes('"甲路"'), '当前文件改成 甲路')
  assert.ok(!当前文.includes('"甲"'), '当前文件不再有 甲')
  assert.ok(历史文.includes('"甲路#'), '历史里的键也改成 甲路#时间戳')
  assert.ok(!历史文.includes('"甲#'), '历史里不再有 甲#')
})
