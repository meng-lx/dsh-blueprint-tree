import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'
import { 切方法 } from '../src/方法文件.ts'

隔离登记表()

async function 造项目(名 = '编辑'): Promise<string> {
  const 父 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-edit-'))
  const 建 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名(名) } })
  assert.equal(建.ok, true, JSON.stringify(建))
  const 项目 = (建.数据 as { 项目: string }).项目

  const 加 = await 执行({
    cmd: '创建单元',
    参数: {
      项目: 项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲路'] },
        { 名: '甲路', 类型: '硬', 下层: ['结束'], 功能: '把上游的数字乘二' },
        { 名: '结束', 类型: '结束' },
      ],
    },
  })
  assert.equal(加.ok, true, JSON.stringify(加))
  return 项目
}

// 读方法不另开命令 —— unit.get 已经带「方法」
test('读方法：unit.get 有自动骨架时给整段原文，写过之后给写过的正文', async () => {
  const 项目 = await 造项目()

  const 空 = await 执行({ cmd: '看单元', 参数: { 项目: 项目, 单元: '甲路' } })
  assert.equal(空.ok, true, JSON.stringify(空))
  const 空数据 = 空.数据 as { 单元: { 功能?: string }; 方法?: string }
  assert.equal(空数据.单元.功能, '把上游的数字乘二', '单元说明要一起给')
  assert.match(String(空数据.方法), /输入\.find/, '自动骨架里应该有取数行')

  const 一段 = ['"甲路"(输入: 上游输入[]) {', '        return { 值: 2 };', '    },'].join('\n')
  const 写 = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 一段 } })
  assert.equal(写.ok, true, JSON.stringify(写))

  const 有 = await 执行({ cmd: '看单元', 参数: { 项目: 项目, 单元: '甲路' } })
  const 有数据 = 有.数据 as { 方法?: string }
  assert.match(String(有数据.方法), /return \{ 值: 2 \};/)
})

test('写方法：写进去再写一次，旧版本进历史', async () => {
  const 项目 = await 造项目()

  const 一段 = ['"甲路"(输入: 上游输入[]) {', '        return { 值: 2 };', '    },'].join('\n')
  const 写 = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 一段 } })
  assert.equal(写.ok, true, JSON.stringify(写))

  const 文件源码 = fs.readFileSync(文件(项目, '主蓝图.方法.ts'), 'utf8')
  assert.ok(切方法(文件源码, '甲路'), '方法文件里应该有「甲路」')

  const 二段 = ['"甲路"(输入: 上游输入[]) {', '        return { 值: 3 };', '    },'].join('\n')
  const 写2 = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 二段 } })
  assert.equal(写2.ok, true, JSON.stringify(写2))
  assert.ok((写2.数据 as { 进历史?: string }).进历史, '第二次写应该有 进历史')

  const 历史 = fs.readFileSync(文件(项目, '主蓝图.方法历史.ts'), 'utf8')
  assert.match(历史, /值: 2/)
})

test('写方法：带公共缩进粘进来也能写对', async () => {
  const 项目 = await 造项目()

  const 带缩进 = ['        "甲路"(输入: 上游输入[]) {', '            return { 值: 7 };', '        },'].join('\n')
  const 写 = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 带缩进 } })
  assert.equal(写.ok, true, JSON.stringify(写))

  const 文件源码 = fs.readFileSync(文件(项目, '主蓝图.方法.ts'), 'utf8')
  const 块 = 切方法(文件源码, '甲路')
  assert.ok(块)
  assert.match(块.文本, /^async "甲路"\(输入: 上游输入\[\]\) {/)
})

test('写方法：只写正文时自动套进骨架（上游取数不用人写）', async () => {
  const 项目 = await 造项目()

  const 正文 = 'const 值 = 9;\nreturn { 值: 值 };'
  const 写 = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 正文 } })
  assert.equal(写.ok, true, JSON.stringify(写))

  const 文件源码 = fs.readFileSync(文件(项目, '主蓝图.方法.ts'), 'utf8')
  const 块 = 切方法(文件源码, '甲路')
  assert.ok(块)
  assert.match(块.文本, /上游_开始 = 输入\.find/, '骨架里的上游取数要自动生成')
  assert.match(块.文本, /\/\*从这里开始\*\*\*/)
  assert.match(块.文本, /return \{ 值: 值 \};/)
})

test('写方法：空正文 = 重置成骨架（不删方法）', async () => {
  const 项目 = await 造项目()
  const 先 = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 'const 值 = 9;\nreturn { 值: 值 };' } })
  assert.equal(先.ok, true, JSON.stringify(先))

  const r = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: '   ' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.数据.已重置, true)

  const 文件源码 = fs.readFileSync(文件(项目, '主蓝图.方法.ts'), 'utf8')
  const 块 = 切方法(文件源码, '甲路')
  assert.ok(块, '方法要还在 —— 单元强制绑定方法，空正文只重置成骨架')
  assert.match(块.文本, /从这里开始\*\*\*\//)
  assert.match(块.文本, /return \{\};/, '正文应该变回占位')
  assert.doesNotMatch(块.文本, /const 值 = 9/)
})
