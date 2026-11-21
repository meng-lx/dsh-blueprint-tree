// project.remove —— 删掉整个项目
//
// 用户 2026-11-09：删项目（暂不考虑留历史做撤回操作）
// 用户 2026-11-10：参数从「路径」改成「项目」名，路径从登记表查
//
// ⚠️ 安全闸：只删**登记过的**、且里面真的有 flow.json 的目录。
// 这个命令没有回收站，删了就没了。

import fs from 'node:fs'
import type { 结果 } from '../types.ts'
import { 成功, 失败 } from '../types.ts'
import type { 命令定义 } from '../commands.ts'
import { 配置路径 } from '../项目.ts'
import { 注销, 定位项目 } from '../登记表.ts'

export const 删项目: 命令定义 = {
  名: 'project.remove',
  说明: '按项目名删掉整个项目目录，并从登记表注销（删了不能恢复）',
  中文: ['删除项目', '删项目', '移除项目', '去掉项目'],
  执行(参数): 结果 {
    const 定 = 定位项目(参数)
    if (!定.ok) return 定
    const { 项目名, 项目目录 } = 定.数据

    // ⚠️ 安全闸：没有 flow.json 就不是项目，不删
    if (!fs.existsSync(配置路径(项目目录))) {
      return 失败('校验', `登记的项目目录里没有 flow.json，拒绝删除：「${项目名}」`, 项目名)
    }

    fs.rmSync(项目目录, { recursive: true, force: true })
    注销(项目名)

    return 成功({ 已删除: 项目名 })
  },
}
