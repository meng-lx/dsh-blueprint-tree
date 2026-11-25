// Worker 里的 AI 反向调用桥（2026-11-26，用户 m19802 的第 1 条）
//
// AI 接线挂在 Host 主进程（`src/host/index.ts` 调 `设AI`），Worker 里的
// `src/ai.ts` 是另一份模块、槽是空的。之前页面启动的 Worker 里所有
// 「没方法的单元交给 AI 处理」都会失败。现在 Worker 发 `{型:'问AI'}`，
// 主线程替它问一次再回 `{型:'AI回'}`。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 跑隔离, 换线程工厂, 有隔离任务 } from '../src/任务.ts'
import type { 线程 } from '../src/任务.ts'
import { 设AI } from '../src/ai.ts'

interface 假线程 extends 线程 {
  收到: unknown[]
  发(事件: 'message' | 'error' | 'exit', 值?: unknown): void
}

function 造替身() {
  const 常驻: Record<string, ((值?: unknown) => void)[]> = { message: [], error: [], exit: [] }
  const 工: 假线程 = {
    收到: [],
    on(事件, 回调) {
      ;(常驻[事件] ??= []).push(回调 as (值?: unknown) => void)
    },
    once(事件, 回调) {
      ;(常驻[事件] ??= []).push(回调 as (值?: unknown) => void)
    },
    postMessage(值) {
      工.收到.push(值)
    },
    terminate() {
      return Promise.resolve(0)
    },
    发(事件, 值) {
      for (const f of 常驻[事件] ?? []) f(值)
    },
  }
  return { 工厂: (): 线程 => 工, 工 }
}

const 等一拍 = (): Promise<void> => new Promise((收) => setImmediate(收))

test('Worker 问 AI：主进程接线替它答，答案送回 Worker', async () => {
  const { 工厂, 工 } = 造替身()
  换线程工厂(工厂)
  设AI(async (系统: string, 用户: string) => `答(${系统}|${用户})`)
  try {
    const 跑 = 跑隔离({ cmd: 'run', 参数: { 项目: '甲', 本次运行: 'r1' } } as never)
    await 等一拍()
    assert.equal(有隔离任务(), true)

    // Worker 发反向调用
    工.发('message', { 型: '问AI', id: '7', 系统: 'sys', 用户: 'usr' })
    await 等一拍()
    const 回 = 工.收到.find((x) => (x as { 型?: string }).型 === 'AI回') as
      | { 型: string; id: string; 文本?: string; 错误?: string }
      | undefined
    assert.ok(回, `主进程应该回一封信，实际收到：${JSON.stringify(工.收到)}`)
    assert.equal(回!.id, '7')
    assert.equal(回!.文本, '答(sys|usr)')

    // 收尾
    工.发('message', { 型: '结果', 结果: { ok: true, 数据: { 完成: true } } })
    const 结果 = await 跑
    assert.equal(结果.ok, true)
    assert.equal(有隔离任务(), false)
  } finally {
    设AI(undefined)
    换线程工厂(undefined)
  }
})

test('Worker 问 AI：主进程没接线时报错回给 Worker，不假装能答', async () => {
  const { 工厂, 工 } = 造替身()
  换线程工厂(工厂)
  设AI(undefined)
  try {
    const 跑 = 跑隔离({ cmd: 'run', 参数: { 项目: '甲', 本次运行: 'r2' } } as never)
    await 等一拍()
    工.发('message', { 型: '问AI', id: '8', 系统: 's', 用户: 'u' })
    await 等一拍()
    const 回 = 工.收到.find((x) => (x as { 型?: string }).型 === 'AI回') as
      | { id: string; 文本?: string; 错误?: string }
      | undefined
    assert.ok(回, '即使没接线也要回信（不能挂在那里）')
    assert.equal(回!.文本, undefined)
    assert.ok(String(回!.错误 ?? '').length > 0, '要带回错误文本')

    工.发('message', { 型: '结果', 结果: { ok: true, 数据: {} } })
    await 跑
  } finally {
    设AI(undefined)
    换线程工厂(undefined)
  }
})
