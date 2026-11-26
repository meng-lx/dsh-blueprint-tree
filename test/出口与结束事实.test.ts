// 出口与「结束事实」—— 用户 m20352 验收的四条缺陷
//
// ① 出口唯一必须是操作层的原子语义：迁移只留新出口、拒绝第二个直接声明、不许删掉最后一个
// ② 报错标记带拓扑版本：修好图不刷新也不会被旧标记误伤；从没看过图也要能落失效
// ③ 卡死不许抹掉「已经到过出口」的事实
// ④ 整图没有出口时要报出来（图级错误）

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 隔离登记表, 唯一名, 文件 } from './工具.ts'
import { 直接写图 } from './造图.ts'
import { 跑 } from '../src/状态机.ts'

隔离登记表()

const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-tree-出口-'))

async function 建项目(基 = '出口'): Promise<string> {
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

function 主链() {
  return {
    开始: '开始',
    结束: '结束',
    单元: [
      { 名: '开始', 类型: '开始', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 下层: ['$结束'] },
    ],
  }
}

test('出口：删掉最后一个出口被拒', async () => {
  const 项目 = await 建项目('零出口')
  直接写图(项目, '主蓝图', 主链())

  const r = await 执行({ cmd: '修改单元', 参数: { 项目, 蓝图: '主蓝图', 单元: '结束', 改: { 下层: [] } } })
  assert.equal(r.ok, false, JSON.stringify(r))
  assert.match((r as any).错误.消息, /唯一的出口/)
  const 图 = 读图(项目)
  assert.deepEqual(图.单元.find((u: any) => u.名 === '结束').下层, ['$结束'], '被拒不写盘')
})

test('出口：非出口单元直接声明 $结束 被拒', async () => {
  const 项目 = await 建项目('双出口')
  直接写图(项目, '主蓝图', 主链())

  const r = await 执行({ cmd: '修改单元', 参数: { 项目, 蓝图: '主蓝图', 单元: '甲', 改: { 下层: ['结束', '$结束'] } } })
  assert.equal(r.ok, false, JSON.stringify(r))
  assert.match((r as any).错误.消息, /只有出口单元能写/)
})

test('出口：迁移是原子的 —— 老出口只留新出口，蓝图头跟着改', async () => {
  const 项目 = await 建项目('迁移')
  // 子蓝图没有「结束」类型单元，出口是普通格
  直接写图(项目, '子图', {
    开始: '入口',
    结束: '出口',
    单元: [
      { 名: '入口', 类型: '硬', 下层: ['尾'] },
      { 名: '出口', 类型: '硬', 下层: ['$结束'] },
      { 名: '尾', 类型: '硬', 下层: ['出口'] },
    ],
  })

  const r = await 执行({ cmd: '修改单元', 参数: { 项目, 蓝图: '子图', 单元: '出口', 改: { 下层: ['尾'] } } })
  assert.equal(r.ok, true, JSON.stringify(r))

  const 图 = 读图(项目, '子图')
  const 出口 = 图.单元.find((u: any) => u.名 === '出口')
  const 尾 = 图.单元.find((u: any) => u.名 === '尾')
  assert.deepEqual(出口.下层, ['尾'], '老出口只留新出口')
  assert.deepEqual(尾.下层, ['$结束'], '新出口拿到 $结束')
  assert.equal(图.结束, '尾', '蓝图头的出口跟着改')
  const 出口们 = 图.单元.filter((u: any) => (u.下层 ?? []).includes('$结束'))
  assert.equal(出口们.length, 1, '任何时候都恰好一个出口')
})

test('卡死：已经到过出口，结束信号与「到过出口」都保留', async () => {
  // 探针形状（用户 m20352）：软格 二次投递让硬格 开了个等不到「开始」的新批次
  const 图 = {
    格式版本: 1,
    名: '主蓝图',
    开始: '开始',
    结束: '结束',
    同步性: 0,
    单元: [
      { 名: '开始', 类型: '开始', 下层: ['软', '硬', '再来'] },
      { 名: '软', 类型: '软', 下层: ['硬'] },
      { 名: '再来', 类型: '硬', 下层: ['软'] },
      { 名: '硬', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 下层: ['$结束'] },
    ],
  }
  const 空 = () => ({})
  const 方法: Record<string, () => Record<string, unknown>> = {
    开始: 空,
    软: 空,
    再来: 空,
    硬: 空,
    结束: 空,
  }
  const 结果 = await 跑(图 as any, {
    主蓝图名: '主蓝图',
    方法,
    共享数据: {},
    读蓝图: (名: string) => (名 === '主蓝图' ? (图 as any) : undefined),
  } as any)

  assert.equal(结果.结局, '卡死', JSON.stringify(结果))
  assert.equal((结果 as any).到过出口, true, '出口格跑过了')
  assert.equal(结果.结束信号, true, '卡死不能把已到出口的事实抹掉')
})

test('报错：拓扑改过之后旧标记不误伤；没看过图也能落失效', async () => {
  const 项目 = await 建项目('过期标记')
  // ① 先看图把「孤岛」标报错
  直接写图(项目, '主蓝图', {
    开始: '开始',
    结束: '结束',
    单元: [
      { 名: '开始', 类型: '开始', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      { 名: '孤岛', 类型: '硬', 下层: [] },
    ],
  })
  await 执行({ cmd: '看图', 参数: { 项目, 蓝图: '主蓝图' } })
  assert.ok(fs.existsSync(path.join(目录(项目), '报错.json')))

  // ② 直接把图修好，但**不刷新**（不重新看图）
  直接写图(项目, '主蓝图', {
    开始: '开始',
    结束: '结束',
    单元: [
      { 名: '开始', 类型: '开始', 下层: ['甲', '孤岛'] },
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      { 名: '孤岛', 类型: '硬', 下层: ['结束'] },
    ],
  })

  await 执行({ cmd: '运行方法', 参数: { 项目 } })

  const 图 = 读图(项目)
  const 孤岛 = 图.单元.find((u: any) => u.名 === '孤岛')
  assert.notEqual(孤岛.状态, '失效', '拓扑已经修好，旧标记不许把它打成失效')

  // ③ 没看过图的断路单元：运行也要落失效
  const 项目2 = await 建项目('没看图')
  直接写图(项目2, '主蓝图', {
    开始: '开始',
    结束: '结束',
    单元: [
      { 名: '开始', 类型: '开始', 下层: ['甲'] },
      { 名: '甲', 类型: '硬', 下层: ['结束'] },
      { 名: '结束', 类型: '结束', 下层: ['$结束'] },
      { 名: '断头', 类型: '硬', 下层: [] },
    ],
  })
  await 执行({ cmd: '运行方法', 参数: { 项目: 项目2 } })
  const 图2 = 读图(项目2)
  assert.equal(图2.单元.find((u: any) => u.名 === '断头').状态, '失效', '没看过图也要落失效')
})
