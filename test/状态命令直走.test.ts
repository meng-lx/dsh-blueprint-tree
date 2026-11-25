// run.status / run.stop 不进蓝图链路（2026-11-26，用户 m19722）
//
// 原因：这两个命令读的是 Host 进程里的任务状态（当前 Worker、在跑的运行标识），
// 蓝图链路的格子根本看不到它们。之前走链路 ⇒ 切到「已登记但没认领这两个命令」
// 的格式化蓝图就报「蓝图里没有认领 run.status 这个命令」。
//
// 这里不真跑蓝图：把两个命令的 执行 换成探针，再让控制器以为「该走蓝图」，
// 断言探针被调到 ⇒ 说明直走分支在蓝图分支之前把它拦下来了。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { 执行 } from '../src/controller.ts'
import { 取命令 } from '../src/commands.ts'
import { 成功 } from '../src/types.ts'

function 临时目录(前缀: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `bt-${前缀}-`))
}

test('run.status / run.stop 直走 TS：不交给格式化蓝图', async () => {
  const 家 = 临时目录('直走家')
  const 项目目录 = 临时目录('直走项目')
  const 旧家 = process.env.BLUEPRINT_TREE_HOME
  const 旧项目 = process.env.BLUEPRINT_TREE_格式化项目
  const 旧后端 = process.env.BLUEPRINT_TREE_BACKEND
  const 探针: string[] = []
  const 原们 = new Map<string, (参数: Record<string, unknown>) => unknown>()
  try {
    // 登记一个「格式化项目」，把后端默认切到蓝图 —— 正常路径会进链路
    fs.writeFileSync(
      path.join(家, '项目登记.json'),
      JSON.stringify({
        格式版本: 1,
        项目: { 格式化甲: { 路径: 项目目录, 蓝图: '主蓝图', 创建于: new Date().toISOString() } },
      }),
      'utf8',
    )
    process.env.BLUEPRINT_TREE_HOME = 家
    process.env.BLUEPRINT_TREE_格式化项目 = '格式化甲'
    delete process.env.BLUEPRINT_TREE_BACKEND // 默认 = 走蓝图

    for (const 名 of ['run.status', 'run.stop']) {
      const 命令 = 取命令(名) as unknown as { 执行: (参数: Record<string, unknown>) => unknown }
      assert.ok(命令, `命令表里应该有 ${名}`)
      原们.set(名, 命令.执行)
      命令.执行 = (参数) => {
        探针.push(名)
        return 成功({ 直走: 名, 参数 } as never)
      }
    }

    for (const 名 of ['run.status', 'run.stop']) {
      const r = await 执行({ cmd: 名, 参数: { 项目: '任意', 本次运行: 'r1' } } as never)
      assert.equal(r.ok, true, `${名} 应该成功：${JSON.stringify(r)}`)
      assert.deepEqual(r.数据, { 直走: 名, 参数: { 项目: '任意', 本次运行: 'r1' } })
    }
    assert.deepEqual(探针, ['run.status', 'run.stop'], '两个命令都必须直走 TS，不能被链路拦成「没有认领」')
  } finally {
    for (const [名, 原] of 原们) {
      const 命令 = 取命令(名) as unknown as { 执行: unknown }
      命令.执行 = 原
    }
    if (旧家 === undefined) delete process.env.BLUEPRINT_TREE_HOME
    else process.env.BLUEPRINT_TREE_HOME = 旧家
    if (旧项目 === undefined) delete process.env.BLUEPRINT_TREE_格式化项目
    else process.env.BLUEPRINT_TREE_格式化项目 = 旧项目
    if (旧后端 === undefined) delete process.env.BLUEPRINT_TREE_BACKEND
    else process.env.BLUEPRINT_TREE_BACKEND = 旧后端
    fs.rmSync(家, { recursive: true, force: true })
    fs.rmSync(项目目录, { recursive: true, force: true })
  }
})
