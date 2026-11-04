import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textToOled, wrapText } from './oled.ts'

test('wraps at spaces, and splits words longer than a line', () => {
	assert.deepEqual(wrapText('vMix MIX 1', 8), ['vMix MIX', '1'])
	assert.deepEqual(wrapText('SCHEDULE', 4), ['SCHE', 'DULE'])
	assert.deepEqual(wrapText('A\nB', 8), ['A', 'B'])
})

test('draws text into the middle of the display, and nothing for empty text', () => {
	assert.equal(textToOled('').some((b) => b !== 0), false)
	const bitmap = textToOled('MAIN')
	assert.equal(bitmap.length, 1024)
	// Double-size text sits in the middle rows, so the top page stays empty
	assert.equal(bitmap.slice(0, 128).some((b) => b !== 0), false)
	assert.ok(bitmap.slice(128 * 2, 128 * 6).some((b) => b !== 0))
})
