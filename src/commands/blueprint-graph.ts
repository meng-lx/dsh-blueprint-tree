// blueprint.graph —— 给界面画图用
//
// 用户 2026-11-15：「蓝图会按照形状和颜色区分单元，用箭头表示向量」
// ⇒ 界面需要一张图的**全部原始字段**（类型/标签/状态/坐标/下层），
//   现有的 `blueprint.detail` 只给蓝图包含关系，字段不够。
//
// 这个命令只读不写，纯转发文件内容 + 锚点。

import fs from 'node:fs'
import path from 'node:path'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 定位项目 } from '../登记表.ts'
import { 生效配置, 产物文件名 } from '../项目.ts'
import type { 蓝图 } from './unit-add.ts'

export const 看图: 命令定义 = {
  名: 'blueprint.graph',
  说明: '给界面画图用：一张图的开始/结束锚点 + 全部单元（类型/标签/状态/坐标/功能/下层）',
  中文: ['看图', '蓝图数据', '图数据'],
  执行(参数): 结果 {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const { 项目名, 项目目录, 项 } = 定.数据

    const 配置 = 生效配置(项目名, 项目目录)
    const 蓝图名 = String(参数.蓝图 ?? 项.蓝图 ?? 配置.蓝图.默认名)
      .trim()
      .replace(/\.json$/i, '')
    if (!蓝图名) return 失败('参数', '「蓝图」不能是空的', '蓝图')

    const p = path.join(项目目录, 产物文件名(配置, 蓝图名).蓝图)
    if (!fs.existsSync(p)) return 失败('不存在', `没有叫「${蓝图名}」的蓝图`, 蓝图名)

    let 图: 蓝图
    try {
      图 = JSON.parse(fs.readFileSync(p, 'utf8')) as 蓝图
    } catch {
      return 失败('IO', `蓝图文件读不出来：${path.basename(p)}`, 蓝图名)
    }

    const 单元们 = (图.单元 ?? []).map((u) => ({
      名: u.名,
      类型: u.类型,
      标签: u.标签,
      状态: u.状态,
      ...(u.坐标 ? { 坐标: u.坐标 } : {}),
      ...(u.功能 !== undefined ? { 功能: u.功能 } : {}),
      ...(u.下层 && u.下层.length ? { 下层: u.下层 } : {}),
    }))

    return 成功({
      项目: 项目名,
      蓝图: 蓝图名,
      开始: 图.开始 ?? null,
      结束: 图.结束 ?? null,
      同步性: 图.同步性 ?? null,
      单元: 单元们,
    })
  },
}
