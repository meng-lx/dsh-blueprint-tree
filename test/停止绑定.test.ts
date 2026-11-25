// 停止请求绑定到「某一次运行」的回归（2026-11-26，用户 m19432）
//
// 验收三条：
//   ① 停错项目不影响当前任务（不能先把 A 杀掉再说）
//   ② 停完第一次重跑正常（上一次的停止请求不能中止这一次）
//   ③ 取消后迟到的结果不能报成功

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 跑隔离, 强杀, 有隔离任务, 换线程工厂, 在跑的项目 } from '../src/任务.ts'
import type { 线程 } from '../src/任务.ts'
import { 应当停止, 读运行记录, 写运行记录 } from '../src/运行记录.ts'
import { 结束运行 } from '../src/commands/end.ts'

interface 假线程 extends 线程 {
  收到: unknown[]
  发(事件: 'message' | 'error' | 'exit', 值?: unknown): void
}

function 造替身() {
  const 清单: 假线程[] = []
  const 工厂 = (): 线程 => {
    const 监听: Record<string, ((值?: unknown) => void)[]> = { message: [], error: [], exit: [] }
    const 工: 假线程 = {
      收到: [],
      once(事件, 回调) {
        ;(监听[事件] ??= []).push(回调 as (值?: unknown) => void)
      },
      postMessage(值) {
        工.收到.push(值)
      },
      terminate() {
        queueMicrotask(() => {
          工.发('exit', 0)
        })
        return Promise.resolve(0)
      },
      发(事件, 值) {
        const 们 = 监听[事件] ?? []
        监听[事件] = []
        for (const f of 们) f(值)
      },
    }
    清单.push(工)
    return 工
  }
  return { 工厂, 清单 }
}

function 临时目录(前缀: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `bt-${前缀}-`))
}

// ① 停错项目：不杀别的项目
test('停 B 不能杀掉正在跑的 A', async () => {
  const { 工厂 } = 造替身()
  换线程工厂(工厂)
  try {
    const 甲 = 跑隔离({ cmd: 'run', 参数: { 项目: 'A' } } as never)
    assert.equal(在跑的项目(), 'A')

    assert.equal(强杀('B'), false, '停 B 不该杀 A')
    assert.equal(有隔离任务(), true, 'A 还在跑')

    assert.equal(强杀('A'), true, '停 A 才杀 A')
    const r = await 甲
    assert.equal(r.错误?.类型, '中止', JSON.stringify(r))
    assert.equal(有隔离任务(), false)
  } finally {
    换线程工厂(undefined)
  }
})

// ③ 取消后迟到的结果不能报成功
test('取消后迟到的结果：仍报「中止」', async () => {
  const { 工厂, 清单 } = 造替身()
  换线程工厂(工厂)
  try {
    const 甲 = 跑隔离({ cmd: 'run', 参数: { 项目: 'A' } } as never)
    assert.equal(强杀('A'), true)

    // 迟到的成功结果
    清单[0].发('message', { 型: '结果', 结果: { ok: true, 数据: { 结局: '完成' } } })

    const r = await 甲
    assert.equal(r.ok, false, '取消过的任务不能报成功')
    assert.equal(r.错误?.类型, '中止', JSON.stringify(r))
  } finally {
    换线程工厂(undefined)
  }
})

// ② 停止请求只对自己那一次生效
test('停止请求只停它绑定的那一次运行', () => {
  const 目录 = 临时目录('停止绑定')
  try {
    写运行记录(目录, { 上次: '运行', 测试报错: [], 本次运行: 'r1', 要求结束: 'r1' })
    assert.equal(应当停止(目录, 'r1'), true, '绑定的那次要停')
    assert.equal(应当停止(目录, 'r2'), false, '重跑的那次不能被旧请求中止')
    assert.equal(应当停止(目录, 'r1'), true, '标记还在，消费前一直有效')
  } finally {
    fs.rmSync(目录, { recursive: true, force: true })
  }
})

// ② 补充：项目根本没在跑时，停止命令不留下任何标记
test('没在跑时停止：不写标记，重跑不受影响', () => {
  const 家 = 临时目录('停止家')
  const 项目目录 = 临时目录('停止项目')
  const 旧 = process.env.BLUEPRINT_TREE_HOME
  try {
    fs.writeFileSync(
      path.join(家, '项目登记.json'),
      JSON.stringify({ 格式版本: 1, 项目: { 甲: { 路径: 项目目录, 蓝图: '主蓝图', 创建于: new Date().toISOString() } } }),
      'utf8',
    )
    process.env.BLUEPRINT_TREE_HOME = 家

    const r = 结束运行.执行({ 项目: '甲' } as never)
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.equal((r.数据 as Record<string, unknown>).要求结束, false)
    const 记 = 读运行记录(项目目录)
    assert.equal(记.要求结束, undefined, '不该留下会掐掉下次重跑的标记')
  } finally {
    if (旧 === undefined) delete process.env.BLUEPRINT_TREE_HOME
    else process.env.BLUEPRINT_TREE_HOME = 旧
    fs.rmSync(家, { recursive: true, force: true })
    fs.rmSync(项目目录, { recursive: true, force: true })
  }
})

// ② 补充：在跑时停止写的标记，绑的是这一次的标识
test('在跑时停止：标记绑到这一次运行', () => {
  const 家 = 临时目录('停止家2')
  const 项目目录 = 临时目录('停止项目2')
  const 旧 = process.env.BLUEPRINT_TREE_HOME
  try {
    fs.writeFileSync(
      path.join(家, '项目登记.json'),
      JSON.stringify({ 格式版本: 1, 项目: { 甲: { 路径: 项目目录, 蓝图: '主蓝图', 创建于: new Date().toISOString() } } }),
      'utf8',
    )
    process.env.BLUEPRINT_TREE_HOME = 家

    写运行记录(项目目录, { 上次: '运行', 测试报错: [], 本次运行: 'r1' })
    const r = 结束运行.执行({ 项目: '甲' } as never)
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.equal((r.数据 as Record<string, unknown>).本次运行, 'r1')

    assert.equal(应当停止(项目目录, 'r1'), true)
    assert.equal(应当停止(项目目录, 'r2'), false, '下一次重跑不能被它中止')

    // 再点一次：提示还没被消费，标记还是同一个
    const 再 = 结束运行.执行({ 项目: '甲' } as never)
    assert.equal(再.ok, true, JSON.stringify(再))
    assert.equal((再.数据 as Record<string, unknown>).本次运行, 'r1')
    assert.equal(读运行记录(项目目录).要求结束, 'r1')
  } finally {
    if (旧 === undefined) delete process.env.BLUEPRINT_TREE_HOME
    else process.env.BLUEPRINT_TREE_HOME = 旧
    fs.rmSync(家, { recursive: true, force: true })
    fs.rmSync(项目目录, { recursive: true, force: true })
  }
})
