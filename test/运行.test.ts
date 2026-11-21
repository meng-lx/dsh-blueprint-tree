// 运行方法 —— 最小链、测试报错落地、卡死
//
// 用户 2026-11-15 定的流程（原话）：
//   「先看之前运行方法和测试方法哪个最后执行,是测试方法就把测试方法标报错的全标失效
//    再启动开始单元,否则直接启动开始单元」
//   「运行方法输入项目吧,这个方法只会改状态+启动项目唯一的开始单元」

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'
import { 直接写图 } from './造图.ts'
import { 写运行记录, 读运行记录 } from '../src/运行记录.ts'

隔离登记表()

const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-run-'))

async function 建项目(基 = '运行'): Promise<string> {
  const 项目 = 唯一名(基)
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 名: 项目, 路径: 根 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return 项目
}

function 目录(项目: string): string {
  return path.dirname(文件(项目, '主蓝图.json'))
}

function 读(项目: string, 名 = '主蓝图'): any {
  return JSON.parse(fs.readFileSync(文件(项目, `${名}.json`), 'utf8'))
}

test('运行方法：最小链跑完，结局是完成', async () => {
  const 项目 = await 建项目()
  await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲'] },
        { 名: '甲', 类型: '硬', 下层: ['结束'] },
        { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      ],
    },
  })

  const r = await 执行({ cmd: '运行方法', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) {
    const d = r.数据 as any
    assert.equal(d.结局, '完成', JSON.stringify(d))
    assert.deepEqual(d.跑了, ['开始', '甲', '结束'])
    assert.equal(d.结束信号, true)
  }

  // 跑完之后记录里应该是「运行」
  assert.equal(读运行记录(目录(项目)).上次, '运行')
})

test('运行方法：上次是测试 ⇒ 它标的报错落地成失效', async () => {
  const 项目 = await 建项目('落地')
  // 直接写一张图：甲乙都正常
  直接写图(项目, '主蓝图', {
    格式版本: 1,
    名: '主蓝图',
    开始: '开始',
    结束: '结束',
    单元: [
      { 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 标签: '无', 状态: '正常', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 标签: '无', 状态: '提醒', 下层: ['$结束'] },
    ],
  })
  for (const 名 of ['甲', '结束']) await 执行({ cmd: '写方法', 参数: { 项目, 单元: 名, 方法: 'return {};' } })

  // 假装上次是「测试」，且它标了「甲」有 C5
  写运行记录(目录(项目), {
    上次: '测试',
    测试报错: [{ 蓝图: '主蓝图', 单元: '甲', 码: 'C5', 消息: '走不到' }],
  })

  const r = await 执行({ cmd: '运行方法', 参数: { 项目 } })
  // 用户 m14161：甲 被落地成「失效」= 断路，这一跑走不到 $结束 ⇒ 必须报错，不能当成功
  assert.equal(r.ok, false, JSON.stringify(r))
  if (!r.ok) {
    assert.equal(r.错误.类型, '未结束', JSON.stringify(r))
    assert.match(r.错误.消息, /甲（失效）/, '报错里要说清是谁被跳过：' + r.错误.消息)
  }

  const 图 = 读(项目)
  const 甲 = 图.单元.find((u: any) => u.名 === '甲')
  assert.equal(甲.状态, '失效', '报错落地后甲应该是失效')
  assert.equal(读运行记录(目录(项目)).上次, '运行')
})

test('运行方法：图里没有开始单元 ⇒ 卡死', async () => {
  const 项目 = await 建项目('没开始')
  直接写图(项目, '主蓝图', {
    格式版本: 1,
    名: '主蓝图',
    开始: null,
    结束: null,
    单元: [{ 名: '甲', 类型: '硬', 标签: '无', 状态: '正常', 下层: ['$结束'] }],
  })

  const r = await 执行({ cmd: '运行方法', 参数: { 项目 } })
  // C1（没有开始单元）会在检查里被拦下，所以拿不到「卡死」而是「校验」——这也是对的
  assert.equal(r.ok, false, JSON.stringify(r))
  if (!r.ok) assert.match(r.错误.消息, /开始|结束|入口/)
})
