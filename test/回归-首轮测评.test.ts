// 首轮测评（2026-11-24）三条结论的回归测试。
// 测评文档：D:\DeepSeek Harness\蓝图树首轮测评.md

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 跑 } from '../src/状态机.ts'
import type { 引擎选项, 上游输入 } from '../src/状态机.ts'
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

test('中止：方法挂住时也能停，晚到的结果不提交', async () => {
  const 主 = 造图('主蓝图', [
    { 名: '开始', 类型: '开始', 下层: ['挂起'] },
    { 名: '挂起', 类型: '硬', 下层: ['结束'] },
    { 名: '结束', 类型: '结束', 下层: ['$结束'] },
  ])

  let 放行!: () => void
  const 挂着 = new Promise<void>((好) => {
    放行 = 好
  })
  let 进来了 = false
  const 跑完回调: string[] = []

  const 选项 = 引擎({ 主蓝图: 主 }, {
    挂起: async () => {
      进来了 = true
      await 挂着
      return { 值: 1 }
    },
  })
  // 单元进去之后再要求停 —— 模拟「跑到一半用户点了结束」
  选项.该停 = () => 进来了
  选项.停轮询毫秒 = 20
  选项.单元跑完 = (_蓝图, 单元) => {
    跑完回调.push(单元)
  }

  const 结果 = await Promise.race([
    跑(主, 选项),
    new Promise<'超时'>((好) => setTimeout(() => 好('超时'), 1000)),
  ])
  assert.notEqual(结果, '超时', '挂起时该停必须能生效，不能一直等下去')
  assert.equal((结果 as { 结局: string }).结局, '中止')

  // 放行之后再等一下，晚到的结果不许写进共享数据 / 不许改状态
  放行()
  await new Promise((好) => setTimeout(好, 60))
  assert.equal(选项.共享数据['主蓝图'], undefined, '中止后晚到的结果不该写共享数据')
  assert.ok(!跑完回调.includes('挂起'), '中止后晚到的结果不该再回调改状态：' + JSON.stringify(跑完回调))
})

test('失败后不再派发新的下游', async () => {
  const 主 = 造图('主蓝图', [
    { 名: '开始', 类型: '开始', 下层: ['失败', '旁路'] },
    { 名: '失败', 类型: '硬', 下层: ['$结束'] },
    { 名: '旁路', 类型: '硬', 下层: ['写入'] },
    { 名: '写入', 类型: '硬', 下层: ['$结束'] },
  ])

  const 跑过: string[] = []
  const 选项 = 引擎({ 主蓝图: 主 }, {
    失败: () => {
      跑过.push('失败')
      throw new Error('炸了')
    },
    旁路: async () => {
      跑过.push('旁路')
      await new Promise((好) => setTimeout(好, 20))
      return { 好了: true }
    },
    写入: () => {
      跑过.push('写入')
      return { 副作用: true }
    },
  })

  const r = await 跑(主, 选项)
  assert.equal(r.结局, '失败')
  assert.ok(!跑过.includes('写入'), '失败之后不该再派发新单元：' + JSON.stringify(r.跑了))
})

test('广播：标签为广播的单元输出，读者能从 __广播 只读快照读到', async () => {
  const 主 = 造图('主蓝图', [
    { 名: '开始', 类型: '开始', 下层: ['广播源'] },
    { 名: '广播源', 类型: '硬', 标签: '广播', 下层: ['中间'] },
    { 名: '中间', 类型: '硬', 下层: ['读者'] },
    { 名: '读者', 类型: '硬', 下层: ['结束'] },
    { 名: '结束', 类型: '结束', 下层: ['$结束'] },
  ])

  let 读者输入: 上游输入[] = []
  const 选项 = 引擎({ 主蓝图: 主 }, {
    广播源: () => ({ 配置: 3 }),
    中间: () => ({ 中间值: 4 }),
    读者: (输入) => {
      读者输入 = 输入
      return {}
    },
  })

  const r = await 跑(主, 选项)
  assert.equal(r.结局, '完成', JSON.stringify(r))

  const 广播 = 读者输入.find((i) => i.来源 === '__广播')
  assert.ok(广播, '读者应当收到 __广播 这一路输入：' + JSON.stringify(读者输入))
  assert.deepEqual(广播!.数据, { 广播源: { 配置: 3 } })
  // 直接上游照旧
  assert.deepEqual(读者输入.find((i) => i.来源 === '中间')?.数据, { 中间值: 4 })

  // 读者改快照里的嵌套值，不许污染广播区原件
  ;(广播!.数据 as Record<string, Record<string, unknown>>).广播源.配置 = 99
  const 区 = (选项.共享数据.__广播 ?? {}) as Record<string, Record<string, unknown>>
  assert.equal(区.广播源.配置, 3, '广播区必须是只读快照，读者改了不能反噬')
})
