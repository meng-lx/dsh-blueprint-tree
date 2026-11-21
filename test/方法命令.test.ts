import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'

隔离登记表()
import { 切方法 } from '../src/方法文件.ts'

function 临时父目录(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-method-'))
}

/** 建一个项目：开始 → 甲路 → 结束 */
async function 造项目(名 = '演示'): Promise<string> {
  const 父 = 临时父目录()
  const 建 = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 路径: 父, 名: 唯一名(名) } })
  assert.equal(建.ok, true, JSON.stringify(建))
  const 项目 = (建.数据 as { 项目: string }).项目

  const 加 = await 执行({
    cmd: '创建单元',
    参数: {
      项目: 项目,
      单元: [
        { 名: '开始', 类型: '开始', 下层: ['甲路'] },
        { 名: '甲路', 类型: '硬', 下层: ['结束'] },
        { 名: '结束', 类型: '结束' },
      ],
    },
  })
  assert.equal(加.ok, true, JSON.stringify(加))
  return 项目
}

function 读(项目: string, 蓝图名 = '主蓝图'): { 当前: string; 历史: string } {
  return {
    当前: fs.readFileSync(文件(项目, `${蓝图名}.方法.ts`), 'utf8'),
    历史: fs.readFileSync(文件(项目, `${蓝图名}.方法历史.ts`), 'utf8'),
  }
}

test('自动骨架：建单元时就按上层生成取数行（method.create 已删）', async () => {
  const 项目 = await 造项目()

  const { 当前 } = 读(项目)
  assert.ok(当前.includes('"甲路"(输入: 上游输入[])'))
  assert.ok(当前.includes('输入.find((i) => i.来源 === "开始")'), '甲路的上游是开始')
  assert.ok(当前.includes('/*从这里开始***'))
  assert.ok(当前.includes('return {};'))
  assert.ok(当前.includes('export const 方法 = {'))
})

test('自动骨架：开始单元没有上游，不生成取数行', async () => {
  const 项目 = await 造项目()
  const { 当前 } = 读(项目)
  const 块 = 切方法(当前, '开始')
  assert.ok(块, '应该能切出「开始」')
  assert.ok(!块!.文本.includes('输入.find'), '开始单元没有上游')
})

test('自动骨架：一次建的多个单元都有骨架', async () => {
  const 项目 = await 造项目()
  const { 当前 } = 读(项目)
  assert.ok(当前.includes('"甲路"(输入: 上游输入[])'))
  assert.ok(当前.includes('"结束"(输入: 上游输入[])'))
  assert.ok(当前.includes('"开始"(输入: 上游输入[])'))
})

test('写方法：同名旧方法先进历史', async () => {
  const 项目 = await 造项目()

  // 先写一版「AI 写过的」正文
  const 首写 = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 'return { 改过了: 1 };' } })
  assert.equal(首写.ok, true, JSON.stringify(首写))

  const r = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 'return {};' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const 数据 = r.数据 as { 进历史?: string }
  assert.ok(typeof 数据.进历史 === 'string', '应该报出进历史的键')
  assert.ok(数据.进历史!.startsWith('甲路#'))

  const { 当前, 历史 } = 读(项目)
  assert.ok(历史.includes('改过了'), '旧版本应该在历史里')
  assert.ok(!当前.includes('改过了'), '当前是新的空骨架')
})

test('method.restore：退回上一版', async () => {
  const 项目 = await 造项目()

  const 写1 = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 'return { 第一版: 1 };' } })
  assert.equal(写1.ok, true, JSON.stringify(写1))

  const 写2 = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 方法: 'return { 第二版: 2 };' } }) // 第一版进历史
  assert.equal(写2.ok, true, JSON.stringify(写2))

  const r = await 执行({ cmd: '还原方法', 参数: { 项目: 项目, 单元: '甲路' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const 数据 = r.数据 as { 还原自: string; 删掉了现在的版本: boolean }
  assert.ok(数据.还原自.startsWith('甲路#'))
  assert.equal(数据.删掉了现在的版本, true)

  const { 当前 } = 读(项目)
  assert.ok(当前.includes('第一版'), '应该退回第一版')
  assert.ok(!当前.includes('第二版'), '第二版已经删掉（用户定的「直接删除」）')
})

test('method.restore：没有历史时报错', async () => {
  const 项目 = await 造项目()
  const r = await 执行({ cmd: '还原方法', 参数: { 项目: 项目, 单元: '甲路' } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')
})

test('写方法：单元不存在时报错', async () => {
  const 项目 = await 造项目()
  const r = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '不存在', 方法: 'return {};' } })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.错误.类型, '不存在')
})

test('写方法：用「蓝图」指定子蓝图，落到子蓝图自己的文件', async () => {
  const 项目 = await 造项目()
  const 加 = await 执行({ cmd: '创建单元', 参数: { 项目: 项目, 单元: [{ 名: '登录', 类型: '子蓝图' }] } })
  assert.equal(加.ok, true, JSON.stringify(加))

  const r = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 蓝图: '登录', 单元: '登录-单元1', 方法: 'return {};' } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 子 = fs.readFileSync(文件(项目, '登录.方法.ts'), 'utf8')
  assert.ok(子.includes('"登录-单元1"'))
  assert.ok(!读(项目).当前.includes('登录-单元1'), '主蓝图的方法文件不该被动')
})

test('history 超上限时删最久的', async () => {
  const 项目 = await 造项目()
  for (let i = 0; i < 4; i++) {
    const r = await 执行({ cmd: '写方法', 参数: { 项目: 项目, 单元: '甲路', 历史个数: 2, 方法: 'return {};' } })
    assert.equal(r.ok, true, JSON.stringify(r))
  }
  const { 历史 } = 读(项目)
  const 个数 = (历史.match(/甲路#/g) ?? []).length
  assert.equal(个数, 2, `历史应该只剩 2 条，实际：\n${历史}`)
})

test('unit.remove：被删单元的方法进历史', async () => {
  const 项目 = await 造项目()

  const r = await 执行({ cmd: '删除单元', 参数: { 项目: 项目, 单元: '甲路' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const 数据 = r.数据 as { 方法进历史?: string[] }
  assert.ok(数据.方法进历史?.length, '应该报出方法进历史了')

  const { 当前, 历史 } = 读(项目)
  assert.ok(!当前.includes('"甲路"('), '当前文件里不该再有它')
  assert.ok(历史.includes('甲路#'), '历史里应该有')
})
