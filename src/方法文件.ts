// 方法文件的读写：解析、切出、插入、删除、改名
//
// 用户 2026-11-10 定了方法层的三件事：
//   创建 = 同名方法加时间戳挪进历史 → 新建
//   删除 = 加时间戳挪进历史
//   还原 = 删掉现在这个 → 历史里最近的去掉时间戳挪回来
//   历史个数超了就删最久的（设置项）
//
// 切方法不能靠正则：花括号会嵌套，字符串 / 模板 / 注释 / 正则里还有假花括号。
// 用 TypeScript 编译器 API 拿 AST 和精确位置。
//
// ⚠️ typescript 必须用 5.x —— 7.x 是 tsgo（Go 版），require 进来没有 Compiler API。

import ts from 'typescript'

export type 方法块 = {
  键: string
  文本: string // 整段属性源码（含键，不含尾逗号）
  体: string // 只有方法体内部（给 AI 看 / 改）
  行: number // 0 起
}

/** 解析源码 */
export function 解析(源码: string, 文件名 = '方法.ts'): ts.SourceFile {
  return ts.createSourceFile(文件名, 源码, ts.ScriptTarget.Latest, true)
}

/** 语法检查。空数组 = 没问题 */
export function 语法错误(源: ts.SourceFile): string[] {
  const 诊断 = (源 as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
  return 诊断.map((d) => {
    const 位置 = 源.getLineAndCharacterOfPosition(d.start ?? 0)
    return `第 ${位置.line + 1} 行第 ${位置.character + 1} 列：${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
  })
}

/** 去掉 `as T` / `satisfies T` / 括号，拿到真正的表达式（空方法文件是 `{ } as Record<string, any>`） */
function 脱壳(n: ts.Expression): ts.Expression {
  let 现: ts.Expression = n
  for (;;) {
    if (ts.isAsExpression(现) || ts.isParenthesizedExpression(现) || (ts.isSatisfiesExpression?.(现) ?? false)) {
      现 = (现 as ts.AsExpression | ts.ParenthesizedExpression | ts.SatisfiesExpression).expression
      continue
    }
    return 现
  }
}

/** 找 `const <变量名> = { ... }` 里那个对象字面量 */
function 找对象(源: ts.SourceFile, 变量名: string): ts.ObjectLiteralExpression | undefined {
  let 命中: ts.ObjectLiteralExpression | undefined

  const 走 = (n: ts.Node): void => {
    if (命中) return
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 变量名 &&
      n.initializer &&
      脱壳(n.initializer) &&
      ts.isObjectLiteralExpression(脱壳(n.initializer) as ts.Expression)
    ) {
      命中 = 脱壳(n.initializer) as ts.ObjectLiteralExpression
      return
    }
    ts.forEachChild(n, 走)
  }
  走(源)
  return 命中
}

function 属性键名(n: ts.PropertyName | undefined): string | undefined {
  if (!n) return undefined
  if (ts.isStringLiteral(n) || ts.isIdentifier(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text
  return undefined
}

function 属性名节点(p: ts.ObjectLiteralElementLike): ts.PropertyName | undefined {
  if (ts.isMethodDeclaration(p) || ts.isPropertyAssignment(p)) return p.name
  return undefined
}

/** 文件里有没有 `const <变量名> = {...}` 这个对象（用来认「是不是新格式」） */
export function 有对象(源码: string, 变量名 = '方法'): boolean {
  return 找对象(解析(源码), 变量名) !== undefined
}

/** 列出所有方法键（按源码顺序） */
export function 列出方法(源码: string, 变量名 = '方法'): string[] {
  const 对象 = 找对象(解析(源码), 变量名)
  if (!对象) return []
  return 对象.properties.map((p) => 属性键名(属性名节点(p))).filter((x): x is string => x !== undefined)
}

/** 切一个方法出来 */
export function 切方法(源码: string, 键: string, 变量名 = '方法'): 方法块 | undefined {
  const 源 = 解析(源码)
  const 对象 = 找对象(源, 变量名)
  if (!对象) return undefined

  for (const p of 对象.properties) {
    if (属性键名(属性名节点(p)) !== 键) continue

    let 体 = ''
    const 体节点 = (p as ts.MethodDeclaration).body
    if (体节点) 体 = 源码.slice(体节点.getStart(源) + 1, 体节点.getEnd() - 1)

    const 起 = p.getStart(源)
    return {
      键,
      文本: 源码.slice(起, p.getEnd()),
      体,
      行: 源.getLineAndCharacterOfPosition(起).line,
    }
  }
  return undefined
}

/** 从源码里删掉一个方法（连它后面的逗号一起） */
export function 删方法(源码: string, 键: string, 变量名 = '方法'): { 源码: string; 删了: boolean } {
  const 源 = 解析(源码)
  const 对象 = 找对象(源, 变量名)
  if (!对象) return { 源码, 删了: false }

  for (const p of 对象.properties) {
    if (属性键名(属性名节点(p)) !== 键) continue
    const 起 = p.getStart(源)
    let 止 = p.getEnd()
    // 连它后面的逗号和空白一起吃掉（否则会留下一个孤零零的 `,`）
    while (止 < 源码.length && /[\s,]/.test(源码[止])) 止++
    // 属性前面那截缩进也去掉，免得删完变成 `{\n    }`
    const 前 = 源码.slice(0, 起).replace(/[ \t]+$/, '')
    return { 源码: 前 + 源码.slice(止), 删了: true }
  }
  return { 源码, 删了: false }
}

/** 把一段方法源码插进对象末尾 */
export function 插方法(源码: string, 文本: string, 变量名 = '方法'): { 源码: string; 插了: boolean } {
  const 源 = 解析(源码)
  const 对象 = 找对象(源, 变量名)
  if (!对象) return { 源码, 插了: false }

  const 属性们 = 对象.properties

  // 空对象：直接塞
  if (属性们.length === 0) {
    const 开 = 对象.getStart(源) + 1
    const 合 = 对象.getEnd() - 1
    return { 源码: 源码.slice(0, 开) + '\n    ' + 文本 + '\n' + 源码.slice(合), 插了: true }
  }

  const 末 = 属性们[属性们.length - 1]
  const 末止 = 末.getEnd()

  // 后面已经有逗号了吗
  let 探 = 末止
  while (探 < 源码.length && /\s/.test(源码[探])) 探++
  const 有逗号 = 源码[探] === ','

  // 缩进照最后一个属性
  const 行首 = 源码.lastIndexOf('\n', 末.getStart(源)) + 1
  const 缩进 = 源码.slice(行首, 末.getStart(源)) || '    '

  const 前 = 有逗号 ? 源码.slice(0, 末止) + ',' : 源码.slice(0, 末止) + ','
  const 后 = 有逗号 ? 源码.slice(探 + 1) : 源码.slice(末止)
  return { 源码: 前 + '\n' + 缩进 + 文本 + 后, 插了: true }
}

/** 把某个键改成新键（方法体不动） */
export function 改键(
  源码: string,
  旧键: string,
  新键: string,
  变量名 = '方法',
): { 源码: string; 改了: boolean } {
  const 源 = 解析(源码)
  const 对象 = 找对象(源, 变量名)
  if (!对象) return { 源码, 改了: false }

  for (const p of 对象.properties) {
    const 名节点 = 属性名节点(p)
    if (属性键名(名节点) !== 旧键 || !名节点) continue
    const 起 = 名节点.getStart(源)
    const 止 = 名节点.getEnd()
    return { 源码: 源码.slice(0, 起) + `"${新键}"` + 源码.slice(止), 改了: true }
  }
  return { 源码, 改了: false }
}

/**
 * 改一整批键（用于单元改名时同步方法键，含历史里的 `旧名#时间戳`）
 * 返回改了几个
 */
export function 改键前缀(
  源码: string,
  旧前缀: string,
  新前缀: string,
  变量名 = '方法',
): { 源码: string; 改了: number } {
  const 键们 = 列出方法(源码, 变量名)
  let 结果 = 源码
  let 次数 = 0

  for (const 键 of 键们) {
    if (键 === 旧前缀) {
      const r = 改键(结果, 键, 新前缀, 变量名)
      if (r.改了) {
        结果 = r.源码
        次数++
      }
    } else if (键.startsWith(旧前缀 + '#')) {
      const 新键 = 新前缀 + 键.slice(旧前缀.length)
      const r = 改键(结果, 键, 新键, 变量名)
      if (r.改了) {
        结果 = r.源码
        次数++
      }
    }
  }
  return { 源码: 结果, 改了: 次数 }
}
