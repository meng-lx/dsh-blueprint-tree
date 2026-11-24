import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'
import { 设AI } from '../src/ai.ts'

隔离登记表()

function 临时父目录(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-gen-'))
}

/** 开始 → 甲路 → 结束 */
async function 造项目(名 = '演示'): Promise<string> {
  const 父 = 临时父目录()
  const 建 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名(名) } })
  assert.equal(建.ok, true, JSON.stringify(建))
  const 项目 = (建.数据 as { 项目: string }).项目

  const 加 = await 执行({
    cmd: '创建单元',
    参数: {
      项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲路'] },
        { 名: '甲路', 类型: '硬', 下层: ['结束'], 功能: '把上游给的值乘二后输出' },
        { 名: '结束', 类型: '结束' },
      ],
    },
  })
  assert.equal(加.ok, true, JSON.stringify(加))
  return 项目
}

function 读方法(项目: string, 蓝图 = '主蓝图'): string {
  return fs.readFileSync(文件(项目, `${蓝图}.方法.ts`), 'utf8')
}

test('method.generate：用单元说明让 AI 写方法', async () => {
  const 项目 = await 造项目()
  let 收到的系统 = ''
  let 收到的用户 = ''

  设AI(async (系统, 用户) => {
    收到的系统 = 系统
    收到的用户 = 用户
    return '```ts\nconst 值 = Number(上游_开始?.值 ?? 0) * 2;\nreturn { 值: 值 };\n```'
  })

  try {
    const r = await 执行({ cmd: '生成方法', 参数: { 项目, 单元: '甲路' } })
    assert.equal(r.ok, true, JSON.stringify(r))
    const 数据 = r.数据 as { 生成: string[]; 方法: string }

    assert.deepEqual(数据.生成, ['甲路'])
    // 返回的是长字符串全文（用户 m07504 要的「结果全塞进去」）
    assert.ok(数据.方法.includes('return { 值: 值 };'), 数据.方法)
    // 围栏被剥掉了
    assert.ok(!数据.方法.includes('```'))

    // 落盘：骨架 + AI 正文
    const 源码 = 读方法(项目)
    assert.ok(源码.includes('"甲路"(输入: 上游输入[])'))
    assert.ok(源码.includes('上游_开始 = 输入.find'))
    assert.ok(源码.includes('const 值 = Number(上游_开始?.值 ?? 0) * 2;'))
    assert.ok(源码.includes('return { 值: 值 };'))

    // 提示词里带上了单元说明和上游
    assert.ok(收到的用户.includes('把上游给的值乘二后输出'), 收到的用户)
    assert.ok(收到的用户.includes('上游_开始'), 收到的用户)
    assert.ok(收到的系统.includes('最后一行必须是 return'), 收到的系统)
  } finally {
    设AI(undefined)
  }
})

test('method.generate：没有「功能」说明就拒绝', async () => {
  const 项目 = await 造项目()
  设AI(async () => 'return {};')
  try {
    const r = await 执行({ cmd: '生成方法', 参数: { 项目, 单元: '结束' } })
    assert.equal(r.ok, false)
    assert.ok(JSON.stringify(r).includes('没有「功能」说明'), JSON.stringify(r))
  } finally {
    设AI(undefined)
  }
})

test('method.generate：AI 没接上时明确报错', async () => {
  const 项目 = await 造项目()
  设AI(undefined)
  const r = await 执行({ cmd: '生成方法', 参数: { 项目, 单元: '甲路' } })
  assert.equal(r.ok, false)
  assert.ok(JSON.stringify(r).includes('AI 没接上'), JSON.stringify(r))
})

test('method.generate：重写时旧方法进历史', async () => {
  const 项目 = await 造项目()
  设AI(async () => 'return { 第一版: 1 };')
  try {
    assert.equal((await 执行({ cmd: '生成方法', 参数: { 项目, 单元: '甲路' } })).ok, true)
    设AI(async () => 'return { 第二版: 2 };')
    const r = await 执行({ cmd: '生成方法', 参数: { 项目, 单元: '甲路' } })
    assert.equal(r.ok, true, JSON.stringify(r))

    const 历史 = fs.readFileSync(文件(项目, '主蓝图.方法历史.ts'), 'utf8')
    assert.ok(历史.includes('甲路#'), 历史)
    assert.ok(历史.includes('第一版'))

    const 当前 = 读方法(项目)
    assert.ok(当前.includes('第二版'))
    assert.ok(!当前.includes('第一版'))
  } finally {
    设AI(undefined)
  }
})
