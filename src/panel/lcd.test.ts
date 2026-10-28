import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LcdBuffer, textToCellLines } from './lcd.ts'

test('wraps long text onto the second line', () => {
	assert.deepEqual(textToCellLines('CAMERA1'), ['CAMER', 'A1   '])
})

test('respects explicit line breaks', () => {
	assert.deepEqual(textToCellLines('CAM\n1'), ['CAM  ', '1    '])
	assert.deepEqual(textToCellLines(undefined), ['     ', '     '])
})

test('renders cells into two 80 character lines', () => {
	const lcd = new LcdBuffer()
	assert.equal(lcd.setCell(0, 'DDR\n1'), true)
	assert.equal(lcd.setCell(0, 'DDR\n1'), false)
	lcd.setCell(15, 'END')
	const [top, bottom] = lcd.lines()
	assert.equal(top.length, 80)
	assert.equal(top.slice(0, 5), 'DDR  ')
	assert.equal(top.slice(75), 'END  ')
	assert.equal(bottom.slice(0, 5), '1    ')
})
