// Worker 停止重启竞态的回归（2026-11-26）
//
// 实测口径：停 A → 立刻启 B → A 收尾 ⇒ B 仍必须能被查询（有隔离任务）和停止；
// 以及「A 在启动前被强杀」要报「中止」，不能因为 exit 码是 0 就报「线程提前退出」。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 跑隔离, 强杀, 有隔离任务, 换线程工厂 } from '../src/任务.ts'
import type { 线程 } from '../src/任务.ts'

interface 假线程 extends 线程 {
  名: string
  收到: unknown[]
  发(事件: 'message' | 'error' | 'exit', 值?: unknown): void
}

function 造替身() {
  const 清单: 假线程[] = []
  const 工厂 = (): 线程 => {
    const 监听: Record<string, ((值?: unknown) => void)[]> = { message: [], error: [], exit: [] }
    const 常驻: Record<string, ((值?: unknown) => void)[]> = { message: [], error: [], exit: [] }
    const 工: 假线程 = {
      名: `假线程${清单.length + 1}`,
      收到: [],
      on(事件, 回调) {
        ;(常驻[事件] ??= []).push(回调 as (值?: unknown) => void)
      },
      once(事件, 回调) {
        ;(监听[事件] ??= []).push(回调 as (值?: unknown) => void)
      },
      postMessage(值) {
        工.收到.push(值)
      },
      terminate() {
        // 真 Worker 被 terminate 后异步发 exit（码常常是 0）
        queueMicrotask(() => {
          工.发('exit', 0)
        })
        return Promise.resolve(0)
      },
      发(事件, 值) {
        for (const f of 常驻[事件] ?? []) f(值)
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

test('启动前被强杀：报「中止」，不是「线程提前退出」', async () => {
  const { 工厂, 清单 } = 造替身()
  换线程工厂(工厂)
  try {
    const 跑着 = 跑隔离({ cmd: 'run' } as never)
    assert.equal(有隔离任务(), true)
    assert.equal(强杀(), true)

    const r = await 跑着
    assert.equal(r.ok, false)
    assert.equal(r.错误?.类型, '中止', JSON.stringify(r))
    assert.equal(有隔离任务(), false)
    assert.ok(清单.length === 1)
  } finally {
    换线程工厂(undefined)
  }
})

test('停 A → 启 B → A 收尾：B 仍能查询、仍能停', async () => {
  const { 工厂, 清单 } = 造替身()
  换线程工厂(工厂)
  try {
    // A 卡着不交结果
    const 甲 = 跑隔离({ cmd: 'run' } as never)

    // 停 A，然后**立刻**启 B（此时 A 的 finally 还没执行）
    assert.equal(强杀(), true)
    const 乙 = 跑隔离({ cmd: 'test.unit' } as never)

    // A 收尾（exit 0 ⇒ 中止）
    const 甲结果 = await 甲
    assert.equal(甲结果.错误?.类型, '中止', JSON.stringify(甲结果))

    // A 的 finally 不许把 B 的引用抹掉
    assert.equal(有隔离任务(), true, 'A 收尾后 B 必须还查得到')

    // 再点停止：停的必须是 B
    assert.equal(强杀(), true, 'B 必须还能被停')
    const 乙结果 = await 乙
    assert.equal(乙结果.错误?.类型, '中止', JSON.stringify(乙结果))
    assert.equal(有隔离任务(), false)

    // 两次强杀各自对应一个线程
    assert.equal(清单.length, 2)
    assert.deepEqual(
      (清单[1].收到[0] as { 指令: { cmd: string } }).指令.cmd,
      'test.unit',
      'B 拿到的是自己的指令',
    )
  } finally {
    换线程工厂(undefined)
  }
})
