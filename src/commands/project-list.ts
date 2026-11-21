// project.list —— 列出登记过的项目
//
// 用户 2026-11-10 的隔离要求：**不返回路径**。
// 所以这里只给「有哪些项目、默认蓝图叫什么、什么时候建的」，
// AI 拿不到具体位置，想动文件必须走别的命令。

import type { 结果 } from '../types.ts'
import { 成功 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 读登记表 } from '../登记表.ts'

export const 列项目: 命令定义 = {
  名: 'project.list',
  说明: '列出所有登记过的项目（只给名字/蓝图/时间，不给路径）',
  中文: ['列出项目', '看项目', '项目列表', '有哪些项目'],
  执行(): 结果 {
    const 表 = 读登记表()
    const 名单 = Object.entries(表.项目)
      .map(([名, 项]) => ({ 名, 蓝图: 项.蓝图, 创建于: 项.创建于 }))
      .sort((a, b) => a.创建于.localeCompare(b.创建于))
    return 成功({ 个数: 名单.length, 项目: 名单 })
  },
}
