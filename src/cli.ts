// 命令行入口
//
//   node src/cli.ts 创建项目 路径=D:/演示 名=第一个
//   node src/cli.ts project.create '{"路径":"D:/演示","名":"第一个"}'

import { 执行 } from './controller.ts'
import { 命令清单 } from './commands.ts'

function 解析键值(args: string[]): Record<string, unknown> {
  const 参数: Record<string, unknown> = {}
  for (const a of args) {
    const i = a.indexOf('=')
    if (i === -1) continue
    参数[a.slice(0, i)] = a.slice(i + 1)
  }
  return 参数
}

const [, , cmd, ...rest] = process.argv

if (!cmd) {
  console.log('用法：node src/cli.ts <命令> [键=值 ...]')
  console.log('')
  console.log('可用命令：')
  for (const c of 命令清单()) {
    console.log(`  ${c.名}  ${c.中文.join(' / ')}`)
    console.log(`      ${c.说明}`)
  }
  process.exit(1)
}

// 两种用法：
//   1) node src/cli.ts <命令> 键=值 ...
//   2) node src/cli.ts '{"cmd":"...","参数":{...}}'   ← 整条指令 JSON
const 指令 = cmd.trim().startsWith('{')
  ? JSON.parse(cmd)
  : {
      cmd,
      参数:
        rest.length === 1 && rest[0].trim().startsWith('{')
          ? JSON.parse(rest[0])
          : 解析键值(rest),
    }

const r = await 执行(指令)
console.log(JSON.stringify(r, null, 2))
if (!r.ok) process.exit(1)
