const ts = require('typescript')

console.log('版本', ts.version)
console.log('createSourceFile:', typeof ts.createSourceFile)
console.log('isMethodDeclaration:', typeof ts.isMethodDeclaration)
console.log('forEachChild:', typeof ts.forEachChild)
console.log('ScriptTarget.Latest:', ts.ScriptTarget && ts.ScriptTarget.Latest)

const 源码 = [
  'export const 方法 = {',
  '  "甲路"(输入: any[]) {',
  '    if (1) { return { a: 1 } }',
  '    return { a };',
  '  },',
  '  "乙路"(输入: any[]) { return {} },',
  '}',
  '',
].join('\n')

const sf = ts.createSourceFile('t.ts', 源码, ts.ScriptTarget.Latest, true)
console.log('parseDiagnostics:', sf.parseDiagnostics.length)

const 名 = []
function 走(n) {
  if ((ts.isMethodDeclaration(n) || ts.isPropertyAssignment(n)) && n.name && typeof n.name.text === 'string') {
    名.push(n.name.text)
  }
  ts.forEachChild(n, 走)
}
走(sf)
console.log('找到的方法:', 名)

let 命中 = null
function 找(n) {
  if (命中) return
  if ((ts.isMethodDeclaration(n) || ts.isPropertyAssignment(n)) && n.name && n.name.text === '甲路') {
    命中 = n
    return
  }
  ts.forEachChild(n, 找)
}
找(sf)

if (命中) {
  const 起 = 命中.getStart(sf)
  const 止 = 命中.getEnd()
  console.log('getStart/getEnd:', 起, 止)
  console.log('切片结果:\n' + 源码.slice(起, 止))
  console.log('第几行:', sf.getLineAndCharacterOfPosition(起))
  if (ts.isMethodDeclaration(命中) && 命中.body) {
    const 体首 = 命中.body.getStart(sf) + 1
    const 体尾 = 命中.body.getEnd() - 1
    console.log('方法体:\n' + 源码.slice(体首, 体尾))
  }
} else {
  console.log('没找到')
}
