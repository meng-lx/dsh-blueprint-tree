// 拓扑报错 —— 「修改后检查拓扑，连不上的标报错；点运行时再落成失效」
//
// 用户 m19933 原话：
//   「修改后检查当前拓扑,连不上的单元就标报错,点运行,运行前把所有报错单元标失效,
//    为了效率,运行不负责检测而且由于报错标记是单独存储的,标失效也快」
//
// 这里测三件事：
//   ① 看图（每次刷新都会看）把连不上的单元标 `报错`，并写进项目根的 `报错.json`
//   ② 拓扑修好之后，再也没人连不上 ⇒ 标记自动清掉
//   ③ 运行开跑前只翻标记：把 `报错` 写成 `失效`，然后把 `报错.json` 删掉

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'
import { 直接写图 } from './造图.ts'
import { 读报错, 写蓝图报错, 算连不上 } from '../src/报错.ts'

隔离登记表()

const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-报错-'))

async function 建项目(基 = '报错'): Promise<string> {
  const 项目 = 唯一名(基)
  const r = await 执行({ cmd: '创建项目', 参数: { 锚点: false, 名: 项目, 路径: 根 } })
  assert.equal(r.ok, true, JSON.stringify(r))
  return 项目
}

function 目录(项目: string): string {
  return path.dirname(文件(项目, '主蓝图.json'))
}

function 读图(项目: string, 名 = '主蓝图'): any {
  return JSON.parse(fs.readFileSync(文件(项目, `${名}.json`), 'utf8'))
}

/** 主链 + 一个孤岛：孤岛从起点走不到、也走不到出口 ⇒ C5 + C6 */
function 带孤岛的图() {
  return {
    开始: '开始',
    结束: '结束',
    单元: [
      { 名: '开始', 类型: '开始', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      { 名: '孤岛', 类型: '硬', 下层: [] },
    ],
  }
}

test('看图：连不上的单元标报错，并写进 报错.json', async () => {
  const 项目 = await 建项目('标报错')
  直接写图(项目, '主蓝图', 带孤岛的图())

  const r = await 执行({ cmd: '看图', 参数: { 项目, 蓝图: '主蓝图' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const 数据 = (r as any).数据
  const 孤岛 = 数据.单元.find((u: any) => u.名 === '孤岛')
  assert.equal(孤岛.状态, '报错', '连不上的单元在图上要显示报错')
  assert.ok(数据.报错?.孤岛, '返回里要带上报错消息')

  const 文件表 = 读报错(目录(项目))
  assert.ok(文件表.主蓝图?.孤岛, '标记要单独存到 报错.json：' + JSON.stringify(文件表))

  // 蓝图 json 本身一个字都不能改（标记是单独的）
  const 图 = 读图(项目)
  assert.equal(图.单元.find((u: any) => u.名 === '孤岛').状态, '正常')
})

test('看图：拓扑修好之后再没人连不上 ⇒ 标记自动清掉', async () => {
  const 项目 = await 建项目('清标记')
  直接写图(项目, '主蓝图', 带孤岛的图())
  await 执行({ cmd: '看图', 参数: { 项目, 蓝图: '主蓝图' } })
  assert.ok(fs.existsSync(path.join(目录(项目), '报错.json')))

  // 把孤岛接到主链上（开始 → 甲 / 孤岛 → 结束 都通了）
  直接写图(项目, '主蓝图', {
    开始: '开始',
    结束: '结束',
    单元: [
      { 名: '开始', 类型: '开始', 下层: ['甲', '孤岛'] },
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '孤岛', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 下层: ['$结束'] },
    ],
  })
  const r = await 执行({ cmd: '看图', 参数: { 项目, 蓝图: '主蓝图' } })
  assert.equal(r.ok, true, JSON.stringify(r))
  const 孤岛 = (r as any).数据.单元.find((u: any) => u.名 === '孤岛')
  assert.equal(孤岛.状态, '正常')
  assert.equal(fs.existsSync(path.join(目录(项目), '报错.json')), false, '没报错了整份文件都不该留')
})

test('运行：开跑前把报错单元落成失效，并删掉 报错.json', async () => {
  const 项目 = await 建项目('落失效')
  直接写图(项目, '主蓝图', 带孤岛的图())
  await 执行({ cmd: '看图', 参数: { 项目, 蓝图: '主蓝图' } })
  assert.ok(fs.existsSync(path.join(目录(项目), '报错.json')))

  // 运行本身不检测：孤岛该被直接翻成失效（这一跑会因为没方法/断路失败，但落地在前）
  await 执行({ cmd: '运行方法', 参数: { 项目 } })

  const 图 = 读图(项目)
  assert.equal(图.单元.find((u: any) => u.名 === '孤岛').状态, '失效', '报错落地后应该是失效')
  assert.equal(fs.existsSync(path.join(目录(项目), '报错.json')), false, '落地完就把标记删掉')
})

test('落地：已经是失效/废弃的单元不再重复标报错', async () => {
  const 项目 = await 建项目('跳过')
  直接写图(项目, '主蓝图', {
    开始: '开始',
    结束: '结束',
    单元: [
      { 名: '开始', 类型: '开始', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      { 名: '孤岛', 类型: '硬', 状态: '失效', 下层: [] },
    ],
  })

  const 图 = 读图(项目)
  const 表 = 算连不上(图, false)
  assert.equal(表.孤岛, undefined, '失效的单元本来就算断路，不该再压报错')

  // 直接调 写蓝图报错：空表会把整段清掉
  const 行 = 写蓝图报错(目录(项目), '主蓝图', { 孤岛: '从起点走不到' })
  assert.ok(行.some((x) => x.includes('报错')))
  assert.ok(读报错(目录(项目)).主蓝图.孤岛)
  写蓝图报错(目录(项目), '主蓝图', {})
  assert.equal(读报错(目录(项目)).主蓝图, undefined)
})
