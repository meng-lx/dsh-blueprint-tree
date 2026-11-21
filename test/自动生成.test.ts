// 用户 2026-11-16（原话，纠正了前一次理解）：
//   「不，你理解错了，写方法是在类似目前的对话框做的，是人机协同部分，
//     而有一些单元可能没法用代码，做出来的目的就是让 ai 处理的，
//     而且这个功能也能做快速验证，通常 ai 能处理说明信息够，可以尝试固化成编程」
//
// ⇒ 运行时遇到没有方法的单元，是**让 AI 直接处理这一格的数据**，
//   返回一段文本，包成 `{ 文本 }` 交给下游；运行时绝不写方法文件。
//   把 AI 的处理固化成方法，是人在对话里另外做的事（method.generate）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'
import { 设AI } from '../src/ai.ts'

隔离登记表()

/**
 * 开始 → 甲路 → 乙路 → 结束。
 * 甲路**没有方法**（交给 AI），乙路有方法、把甲路给的 `文本` 记到 globalThis 上。
 * 甲路 有没有「功能」说明由调用方给。
 */
async function 造项目(功能?: string): Promise<string> {
  const 父 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-aiunit-'))
  const 建 = await 执行({
    cmd: '创建项目',
    参数: { 锚点: false, 路径: 父, 名: 唯一名('ai单元') },
  })
  assert.equal(建.ok, true, JSON.stringify(建))
  const 项目 = (建.数据 as { 项目: string }).项目

  const 加 = await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲路'] },
        { 名: '甲路', 类型: '硬', 下层: ['乙路'], ...(功能 === undefined ? {} : { 功能 }) },
        { 名: '乙路', 类型: '硬', 下层: ['结束'] },
        { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      ],
    },
  })
  assert.equal(加.ok, true, JSON.stringify(加))

  // 只给乙路写方法：把上游甲路（AI 处理出来的）`文本` 记下来
  fs.writeFileSync(
    文件(项目, '主蓝图.方法.ts'),
    `export const 方法 = {
  "乙路"(输入: 上游输入[]) {
    const 上游_甲路 = 输入.find((i) => i.来源 === "甲路")?.数据 as Record<string, unknown> | undefined;
    (globalThis as Record<string, unknown>).__看到 = String(上游_甲路?.文本 ?? "");
    return {};
  },
}
`,
    'utf8',
  )
  return 项目
}

test('运行方法：没方法的单元交给 AI 处理，结果包成 { 文本 } 给下游', async () => {
  const 项目 = await 造项目('把上游给的值乘二后输出')
  ;(globalThis as Record<string, unknown>).__看到 = undefined

  let 问了几次 = 0
  let 系统 = ''
  let 用户 = ''
  设AI(async (a, b) => {
    问了几次++
    系统 = a
    用户 = b
    return '乘二以后是 42'
  })

  try {
    const r = await 执行({ cmd: '运行方法', 参数: { 项目 } })
    assert.equal(r.ok, true, JSON.stringify(r))
    const 数据 = r.数据 as Record<string, unknown>

    // 只处理了甲路，且只问一次
    assert.deepEqual(数据.ai处理, ['主蓝图·甲路'])
    assert.equal(问了几次, 1)

    // 提示词带着单元说明
    assert.ok(用户.includes('把上游给的值乘二后输出'), 用户)
    assert.ok(系统.includes('一段纯文本'), 系统)

    // 下游拿到的是 { 文本: "..." }
    assert.equal((globalThis as Record<string, unknown>).__看到, '乘二以后是 42')

    // 运行时**不许**写方法文件：没有 `"甲路"(输入: ...)` 这个方法键
    const 源码 = fs.readFileSync(文件(项目, '主蓝图.方法.ts'), 'utf8')
    assert.ok(!源码.includes('"甲路"(输入'), 源码)
  } finally {
    设AI(undefined)
  }
})

test('运行方法：没写「功能」说明就不问 AI，直接失败并指出是哪个单元', async () => {
  const 项目 = await 造项目()
  let 问了几次 = 0
  设AI(async () => {
    问了几次++
    return '不该被问到'
  })

  try {
    const r = await 执行({ cmd: '运行方法', 参数: { 项目 } })
    assert.equal(问了几次, 0)
    assert.equal(r.ok, false, JSON.stringify(r))
    assert.ok(JSON.stringify(r).includes('没有「功能」说明'), JSON.stringify(r))
  } finally {
    设AI(undefined)
  }
})
