import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 解析, 语法错误, 列出方法, 切方法, 删方法, 插方法, 改键, 改键前缀 } from '../src/方法文件.ts'

const 样例 = `export const 方法 = {
  "甲路"(输入: 上游输入[]) {
    const s = "}"
    const t = \`a\${ { b: 1 } }\`
    // 注释里的 } 不能算
    if (1) { return { a: 1 } }
    return { a: 1 };
  },
  "乙路"(输入: 上游输入[]) {
    return { b: 2 };
  },
}
`

test('语法检查：样例本身没问题', () => {
  assert.deepEqual(语法错误(解析(样例)), [])
})

test('列出方法：按源码顺序，不会把 return 里的字段当成方法', () => {
  assert.deepEqual(列出方法(样例), ['甲路', '乙路'])
})

test('切方法：拿到整段源码，且不被字符串/模板/注释里的花括号骗', () => {
  const 块 = 切方法(样例, '甲路')
  assert.ok(块)
  assert.ok(块.文本.startsWith('"甲路"'))
  assert.ok(块.文本.endsWith('}'))
  assert.ok(块.文本.includes('const s = "}"'))
  assert.ok(块.文本.includes('a${ { b: 1 } }'))
  assert.ok(块.体.includes('return { a: 1 }'))
  assert.ok(!块.体.includes('"甲路"'), '体里不该有键名')
  assert.equal(块.行, 1)
})

test('切方法：不存在返回 undefined', () => {
  assert.equal(切方法(样例, '不存在的'), undefined)
})

test('删方法：甲路没了，乙路还在，且语法仍然合法', () => {
  const r = 删方法(样例, '甲路')
  assert.equal(r.删了, true)
  assert.deepEqual(列出方法(r.源码), ['乙路'])
  assert.deepEqual(语法错误(解析(样例)), [])
})

test('删方法：删最后一个也合法', () => {
  const r = 删方法(样例, '乙路')
  assert.equal(r.删了, true)
  assert.deepEqual(列出方法(r.源码), ['甲路'])
})

test('插方法：插进去能被重新切出来', () => {
  const 块 = 切方法(样例, '甲路')
  assert.ok(块)
  const 空 = `export const 方法历史 = {\n}\n`
  const r = 插方法(空, 块.文本, '方法历史')
  assert.equal(r.插了, true)
  assert.deepEqual(列出方法(r.源码, '方法历史'), ['甲路'])
  assert.deepEqual(语法错误(解析(r.源码)), [])
})

test('删了再插：内容不变', () => {
  const 块 = 切方法(样例, '甲路')
  assert.ok(块)
  const 删后 = 删方法(样例, '甲路').源码
  const 插后 = 插方法(删后, 块.文本).源码
  const 新块 = 切方法(插后, '甲路')
  assert.ok(新块)
  assert.equal(新块.文本, 块.文本)
})

test('改键：保留方法体，只换名字', () => {
  const r = 改键(样例, '甲路', '甲路-新')
  assert.equal(r.改了, true)
  assert.deepEqual(列出方法(r.源码), ['甲路-新', '乙路'])
  assert.ok(切方法(r.源码, '甲路-新')?.文本.includes('return { a: 1 }'))
})

test('改键前缀：历史和当前一起改', () => {
  const 历史 = `export const 方法历史 = {
  "甲路#20261110-141230"(输入: 上游输入[]) { return { a: 1 } },
  "甲路#20261109-100000"(输入: 上游输入[]) { return { a: 2 } },
  "乙路#20261110-141230"(输入: 上游输入[]) { return { b: 1 } },
}
`
  const r = 改键前缀(历史, '甲路', '甲路-新', '方法历史')
  assert.equal(r.改了, 2)
  assert.deepEqual(列出方法(r.源码, '方法历史'), [
    '甲路-新#20261110-141230',
    '甲路-新#20261109-100000',
    '乙路#20261110-141230',
  ])
})

test('空对象里插图', () => {
  const a = `export const 方法 = {}\n`
  const r = 插方法(a, '"甲路"(输入: 上游输入[]) { return {} }')
  assert.equal(r.插了, true)
  assert.deepEqual(列出方法(r.源码), ['甲路'])
})

test('没有「方法」这个对象时，列出返回空、切返回 undefined', () => {
  const 别的 = `export const 别的 = { "甲路"(输入: any[]) { return {} } }\n`
  assert.deepEqual(列出方法(别的), [])
  assert.equal(切方法(别的, '甲路'), undefined)
})
