// Phase 3 终止清理（2026-11-26 开发安排）
//
// 口径：第一次观察到失败或中止就锁住原因、清池、放掉被背压挂住的上游，
// **不等不合作的方法**；在途回调恢复后一律不提交（共享/广播/父格输出、
// 下游派发、`完成()` 的重试、单元跑完回调）。
//
// 任务书：D:\DeepSeek Harness\交接\树状蓝图\2026-11-26-开发安排-Phase3终止清理.md

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 跑 } from '../src/状态机.ts'
import type { 引擎选项 } from '../src/状态机.ts'
import type { 蓝图, 单元 } from '../src/commands/unit-add.ts'

function 造图(名: string, 单元们: Partial<单元>[], 开始?: string): 蓝图 {
  return {
    格式版本: 1,
    名,
    开始: 开始 ?? '开始',
    结束: '结束',
    同步性: 0,
    单元: 单元们.map((u) => ({
      类型: '硬',
      标签: '无',
      状态: '提醒',
      ...u,
      名: u.名!,
    })) as 单元[],
  }
}

function 引擎(图们: Record<string, 蓝图>, 方法: 引擎选项['方法'] = {}): 引擎选项 {
  return {
    读蓝图: (名) => 图们[名],
    方法,
    共享数据: {},
    主蓝图名: '主蓝图',
  }
}

function 限时<T>(p: Promise<T>, 毫秒: number): Promise<T | '超时'> {
  return Promise.race([p, new Promise<'超时'>((好) => setTimeout(() => 好('超时'), 毫秒).unref?.())])
}

/** 失败 + 一条卡在受控 Promise 上的旁路：失败格与旁路同时在途 */
function 并行场景(): {
  主: 蓝图
  放行: () => void
  拒绝: (e: unknown) => void
  进去: () => boolean
  跑过: string[]
  跑完回调: string[]
  选项: 引擎选项
} {
  const 主 = 造图('主蓝图', [
    { 名: '开始', 类型: '开始', 下层: ['炸', '挂起'] },
    { 名: '炸', 类型: '硬', 下层: ['$结束'] },
    { 名: '挂起', 类型: '硬', 下层: ['尾'] },
    { 名: '尾', 类型: '硬', 下层: ['$结束'] },
  ])

  let 放行!: () => void
  let 拒绝!: (e: unknown) => void
  const 等着 = new Promise<void>((好, 坏) => {
    放行 = 好
    拒绝 = 坏
  })
  let 已进 = false
  const 跑过: string[] = []
  const 跑完回调: string[] = []

  const 选项 = 引擎({ 主蓝图: 主 }, {
    炸: () => {
      跑过.push('炸')
      throw new Error('first')
    },
    挂起: async () => {
      已进 = true
      跑过.push('挂起')
      await 等着
      return { 晚到: 1 }
    },
    尾: () => {
      跑过.push('尾')
      return { 尾: 1 }
    },
  })
  选项.单元跑完 = (_蓝图, 单元) => {
    跑完回调.push(单元)
  }

  return { 主, 放行, 拒绝, 进去: () => 已进, 跑过, 跑完回调, 选项 }
}

test('失败：不等卡住的旁路就返回，错误是首个失败的', async () => {
  const s = 并行场景()
  const 结果 = await 限时(跑(s.主, s.选项), 400)
  assert.notEqual(结果, '超时', '有方法卡住时也必须立刻返回失败，不能等它')
  const r = 结果 as { 结局: string; 错误?: Error; 错误单元?: string }
  assert.equal(r.结局, '失败')
  assert.equal(r.错误?.message, 'first', '保留首个失败诊断')
  assert.equal(r.错误单元, '炸')
  assert.ok(s.进去(), '旁路确实已经在途')
})

test('失败后放行（成功）：晚到结果不写共享数据、不派下游、不回调', async () => {
  const s = 并行场景()
  const 结果 = await 限时(跑(s.主, s.选项), 400)
  assert.notEqual(结果, '超时')

  s.放行()
  await new Promise((好) => setTimeout(好, 80))

  assert.equal((s.选项.共享数据['主蓝图'] ?? {}).挂起, undefined, '失败后晚到的输出不该提交')
  assert.ok(!s.跑过.includes('尾'), '失败后不该派新下游：' + JSON.stringify(s.跑过))
  assert.ok(!s.跑完回调.includes('挂起'), '失败后晚到结果不该再回调改状态：' + JSON.stringify(s.跑完回调))
})

test('失败后放行（拒绝）：晚到的异常不覆盖首个诊断，也不外泄', async () => {
  const s = 并行场景()
  const 结果 = await 限时(跑(s.主, s.选项), 400)
  assert.notEqual(结果, '超时')

  s.拒绝(new Error('晚到的炸'))
  await new Promise((好) => setTimeout(好, 80))

  const r = 结果 as { 结局: string; 错误?: Error }
  assert.equal(r.结局, '失败')
  assert.equal(r.错误?.message, 'first', '后到的异常不覆盖首个失败')
  assert.equal((s.选项.共享数据['主蓝图'] ?? {}).挂起, undefined)
  assert.ok(!s.跑过.includes('尾'))
  assert.ok(!s.跑完回调.includes('挂起'))
})

test('throw undefined 也算失败', async () => {
  const 主 = 造图('主蓝图', [
    { 名: '开始', 类型: '开始', 下层: ['炸'] },
    { 名: '炸', 类型: '硬', 下层: ['$结束'] },
  ])
  const 选项 = 引擎({ 主蓝图: 主 }, {
    炸: () => {
      // JS 允许 throw undefined：不能用「有没有错误对象」判失败
      throw undefined
    },
  })

  const r = await 跑(主, 选项)
  assert.equal(r.结局, '失败')
  assert.equal((r.错误 as Error)?.message, '方法抛了非 Error 的值')
  assert.equal(r.错误单元, '炸')
})

test('中止：卡住的方法不阻挡返回，晚到结果不提交', async () => {
  const 主 = 造图('主蓝图', [
    { 名: '开始', 类型: '开始', 下层: ['挂起'] },
    { 名: '挂起', 类型: '硬', 下层: ['尾'] },
    { 名: '尾', 类型: '硬', 下层: ['$结束'] },
  ])

  let 放行!: () => void
  const 等着 = new Promise<void>((好) => {
    放行 = 好
  })
  let 已进 = false
  const 跑过: string[] = []
  const 选项 = 引擎({ 主蓝图: 主 }, {
    挂起: async () => {
      已进 = true
      跑过.push('挂起')
      await 等着
      return { 晚到: 1 }
    },
    尾: () => {
      跑过.push('尾')
      return {}
    },
  })
  选项.该停 = () => 已进
  选项.停轮询毫秒 = 20

  const 结果 = await 限时(跑(主, 选项), 500)
  assert.notEqual(结果, '超时', '中止也不能等卡住的方法')
  assert.equal((结果 as { 结局: string }).结局, '中止')

  放行()
  await new Promise((好) => setTimeout(好, 80))
  assert.equal((选项.共享数据['主蓝图'] ?? {}).挂起, undefined, '中止后晚到的输出不提交')
  assert.ok(!跑过.includes('尾'), '中止后不派新下游')
})

test('子图内失败：父图格子不提交输出，父图下游不跑', async () => {
  const 主 = 造图('主蓝图', [
    { 名: '开始', 类型: '开始', 下层: ['子格'] },
    { 名: '子格', 类型: '子蓝图', 下层: ['尾'] },
    { 名: '尾', 类型: '硬', 下层: ['$结束'] },
  ])
  const 子 = 造图(
    '子格',
    [
      { 名: '子入口', 类型: '硬', 下层: ['炸'] },
      { 名: '炸', 类型: '硬', 下层: ['$结束'] },
    ],
    '子入口',
  )

  const 跑过: string[] = []
  const 选项 = 引擎({ 主蓝图: 主, 子格: 子 }, {
    炸: () => {
      跑过.push('炸')
      throw new Error('子图里炸了')
    },
    尾: () => {
      跑过.push('尾')
      return {}
    },
  })

  const r = await 跑(主, 选项)
  assert.equal(r.结局, '失败')
  assert.equal((r.错误 as Error)?.message, '子图里炸了')
  const 提交 = (选项.共享数据['主蓝图'] ?? {}) as Record<string, unknown>
  // 进子图时会先给父格写一条占位（{}）；失败后子图出口不得再往它上面提交任何字段
  assert.deepEqual(提交.子格 ?? {}, {}, '失败时子图出口不得提交输出（只允许入口占位）')
  assert.equal(提交.尾, undefined, '失败后不得提交父图后续单元的输出')
  assert.ok(!跑过.includes('尾'), '不得触发父图下游：' + JSON.stringify(跑过))
})
