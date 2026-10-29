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

test('renders each half of the stripe as its own 2-line LCD', () => {
	const lcd = new LcdBuffer()
	assert.equal(lcd.setCell(0, 'DDR\n1'), true)
	assert.equal(lcd.setCell(0, 'DDR\n1'), false)
	lcd.setCell(8, 'M/E\n2')
	lcd.setCell(15, 'END')
	const [left, right] = lcd.displays()
	assert.equal(left.length, 80)
	assert.equal(left.slice(0, 5), 'DDR  ')
	assert.equal(left.slice(40, 45), '1    ')
	// Matches what the TriCaster sent for its M/E labels: names on the top line, numbers below
	assert.equal(right.slice(0, 5), 'M/E  ')
	assert.equal(right.slice(35, 40), 'END  ')
	assert.equal(right.slice(40, 45), '2    ')
})
