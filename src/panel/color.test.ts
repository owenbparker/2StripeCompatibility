import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseColor } from './color.ts'

test('parses hex colours', () => {
	assert.deepEqual(parseColor('#ff8000'), { r: 255, g: 128, b: 0 })
	assert.deepEqual(parseColor('00ff00'), { r: 0, g: 255, b: 0 })
})

test('parses rgb() colours', () => {
	assert.deepEqual(parseColor('rgb(10, 20, 300)'), { r: 10, g: 20, b: 255 })
})

test('treats missing or unknown colours as off', () => {
	assert.deepEqual(parseColor(undefined), { r: 0, g: 0, b: 0 })
	assert.deepEqual(parseColor('purple'), { r: 0, g: 0, b: 0 })
})

