// 结束命令 + 状态机的中止
//
// 用户 2026-11-15：
//   「结束就是结束当前项目所有正在跑的,并清空待做池和共享参数」
//   「我建议做一个结束命令,供测试和AI或用户用」

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 跑 } from '../src/状态机.ts'
import { 读运行记录, 写运行记录 } from '../src/运行记录.ts'
import { 隔离登记表, 唯一名, 目录 } from './工具.ts'

隔离登记表()

async function 建项目(基: string): Promise<string> {
  const 名 = 唯一名(基)
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-end-'))
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 名, 路径: 根 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return 名
}

// 用户 m19432：停止请求必须绑定到「某一次运行」。
// 没在跑就不写标记 —— 否则下一次重跑会被上一次的停止请求直接中止。
test('结束命令：没在跑时不写标记', async () => {
  const 项目 = await 建项目('结束没在跑')
  const r = await 执行({ cmd: '结束', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(读运行记录(目录(项目)).要求结束, undefined, '不该留下会掐掉下次重跑的标记')
  if (r.ok) assert.equal((r.数据 as Record<string, unknown>).要求结束, false)
})

test('结束命令：在跑时写绑到这一次的标记，重复调提示「还没被消费」', async () => {
  const 项目 = await 建项目('结束重复')
  写运行记录(目录(项目), { 上次: '运行', 测试报错: [], 本次运行: 'r1' })

  const 一 = await 执行({ cmd: '结束', 参数: { 项目 } })
  assert.equal(一.ok, true, JSON.stringify(一))
  assert.equal(读运行记录(目录(项目)).要求结束, 'r1')

  const r = await 执行({ cmd: '结束', 参数: { 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) assert.match(JSON.stringify(r.数据), /还没被状态机消费/)
})

test('状态机：该停 返回 true ⇒ 结局是「中止」，共享数据被清空', async () => {
  const 共享数据: Record<string, Record<string, Record<string, unknown>>> = {
    主蓝图: { 开始: { 留着: '要被清掉' } },
  }
  let 轮 = 0
  const 结果 = await 跑(
    {
      格式版本: 1,
      名: '主蓝图',
      开始: '开始',
      结束: null,
      单元: [{ 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: [] }],
    },
    {
      读蓝图: () => undefined,
      方法: { 开始: () => ({ ok: 1 }) },
      共享数据,
      主蓝图名: '主蓝图',
      // 第一轮让开始跑，第二轮叫停
      该停: () => ++轮 > 1,
    },
  )
  assert.equal(结果.结局, '中止', JSON.stringify(结果))
  assert.deepEqual(结果.跑了, ['开始'])
  assert.deepEqual(共享数据, {}, '共享数据该被清空')
})

test('状态机：单元跑完 回调会被逐次调用（不是一起调）', async () => {
  const 见到: string[] = []
  const 结果 = await 跑(
    {
      格式版本: 1,
      名: '主蓝图',
      开始: '开始',
      结束: null,
      单元: [
        { 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: ['甲'] },
        { 名: '甲', 类型: '硬', 标签: '无', 状态: '失效', 下层: [] },
      ],
    },
    {
      读蓝图: () => undefined,
      方法: {},
      共享数据: {},
      主蓝图名: '主蓝图',
      单元跑完: (_, 单元) => 见到.push(单元),
    },
  )
  // 甲是失效 ⇒ 直接算完，不进回调（回调只给真跑了方法的）
  assert.deepEqual(见到, ['开始'], JSON.stringify(结果))
  assert.equal(结果.结局, '完成')
})
