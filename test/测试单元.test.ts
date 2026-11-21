// 单单元测试（test.unit）

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名 } from './工具.ts'

隔离登记表()

/** 建一个项目，写一份蓝图 + 一份方法文件 */
async function 造项目(方法: string): Promise<{ 项目: string; 目录: string }> {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-testunit-'))
  const 项目 = 唯一名('测试单元')
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 根, 名: 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) throw new Error('建项目失败')

  const 目录 = path.join(根, 项目)
  // 蓝图：开始 → 甲 → 结束
  fs.writeFileSync(
    path.join(目录, '主蓝图.json'),
    JSON.stringify(
      {
        格式版本: 1,
        名: '主蓝图',
        开始: '开始',
        结束: '结束',
        单元: [
          { 名: '开始', 类型: '开始', 标签: '无', 状态: '提醒', 下层: ['甲'] },
          { 名: '甲', 类型: '硬', 标签: '无', 状态: '提醒', 下层: ['结束'] },
          { 名: '结束', 类型: '结束', 标签: '无', 状态: '提醒', 下层: ['$结束'] },
        ],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
  fs.writeFileSync(path.join(目录, '主蓝图.方法.ts'), 方法, 'utf8')
  return { 项目, 目录 }
}

/** 自定蓝图 + 方法文件 */
async function 造自定项目(图: unknown, 方法: string): Promise<{ 项目: string; 目录: string }> {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-testunit-'))
  const 项目 = 唯一名('测试单元')
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 根, 名: 项目 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (!r.ok) throw new Error('建项目失败')
  const 目录 = path.join(根, 项目)
  fs.writeFileSync(path.join(目录, '主蓝图.json'), JSON.stringify(图, null, 2) + '\n', 'utf8')
  fs.writeFileSync(path.join(目录, '主蓝图.方法.ts'), 方法, 'utf8')
  return { 项目, 目录 }
}

test('测试单元：手动给上游参数，输出直接返回', async () => {
  const { 项目 } = await 造项目(`
export const 方法 = {
  "甲"(输入: 上游输入[]) {
    const 上游_开始 = 输入.find((i) => i.来源 === "开始")?.数据 as { n?: number } | undefined
    const 翻倍: number = (上游_开始?.n ?? 0) * 2
    return { 翻倍 };
  },
}
`)
  const r = await 执行({
    cmd: '测试单元',
    参数: { 项目, 单元: '甲', 上游: [{ 来源: '开始', 数据: { n: 21 } }] },
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) {
    assert.equal(r.数据.成功, 1)
  }
})

test('测试单元：压测 10 次，次数和耗时都在', async () => {
  const { 项目 } = await 造项目(`
export const 方法 = {
  "甲"(输入: 上游输入[]) {
    const 数: number = 1
    return { 数 };
  },
}
`)
  const r = await 执行({ cmd: '测试单元', 参数: { 项目, 单元: '甲', 次数: 10 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) {
    assert.equal(r.数据.次数, 10)
    assert.equal(r.数据.成功, 10)
    assert.ok(r.数据.耗时毫秒, '要有耗时统计')
  }
})

test('测试单元：并发标签 ⇒ 10 次并发跑', async () => {
  const { 项目 } = await 造项目(`
export const 方法 = {
  "甲"(输入: 上游输入[]) {
    const 数: number = 1
    return { 数 };
  },
}
`)
  const r = await 执行({ cmd: '测试单元', 参数: { 项目, 单元: '甲', 次数: 2, 随机: true } })
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('测试单元：单元没有方法 ⇒ 报错', async () => {
  const { 项目 } = await 造项目(`export const 方法 = {}\n`)
  const r = await 执行({ cmd: '测试单元', 参数: { 项目, 单元: '甲' } })
  assert.equal(r.ok, false, JSON.stringify(r))
  if (!r.ok) assert.match(r.错误.消息, /没有方法/)
})

test('测试单元：方法抛错 ⇒ 报错带消息', async () => {
  const { 项目 } = await 造项目(`
export const 方法 = {
  "甲"(输入: 上游输入[]) {
    throw new Error('这个方法故意炸了')
  },
}
`)
  const r = await 执行({ cmd: '测试单元', 参数: { 项目, 单元: '甲' } })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.错误.类型, '运行')
    assert.match(r.错误.消息, /故意炸了/)
  }
})

test('测试单元：随机模式按类型造（number 造数字）', async () => {
  const { 项目 } = await 造项目(`
export const 方法 = {
  "开始"(输入: 上游输入[]) {
    const 数: number = 7
    const 词: string = "abc"
    return { 数, 词 };
  },
  "甲"(输入: 上游输入[]) {
    const 拿到的数: number = 输入.find((i) => i.来源 === "开始")?.数据?.数 as number
    return { 数: 拿到的数 };
  },
}
`)
  const r = await 执行({ cmd: '测试单元', 参数: { 项目, 单元: '甲', 随机: true } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) {
    assert.equal(r.数据.成功, 1)
  }
})

test('测试单元：只跑这一格，下游不跑（引擎「单元测试」模式）', async () => {
  const { 项目 } = await 造自定项目(
    {
      格式版本: 1,
      名: '主蓝图',
      开始: '开始',
      结束: '结束',
      单元: [
        { 名: '开始', 类型: '开始', 标签: '无', 状态: '正常', 下层: ['甲'] },
        { 名: '甲', 类型: '硬', 标签: '无', 状态: '正常', 下层: ['乙'] },
        { 名: '乙', 类型: '硬', 标签: '无', 状态: '正常', 下层: ['结束'] },
        { 名: '结束', 类型: '结束', 标签: '无', 状态: '正常', 下层: ['$结束'] },
      ],
    },
    `export const 方法 = {
  "甲"(输入: 上游输入[]) {
    const 值: number = 1
    return { 值 }
  },
  "乙"(输入: 上游输入[]) {
    throw new Error('下游不该跑')
  },
}
`,
  )
  const r = await 执行({ cmd: '测试单元', 参数: { 项目, 单元: '甲', 随机: true } })
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) assert.equal(r.数据.成功, 1)
})
