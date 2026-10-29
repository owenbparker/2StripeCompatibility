import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSurfaceLayout, findButton, LCD_CELLS, PANEL_BUTTONS } from './controls.ts'

test('every control has a unique id and grid position', () => {
	const layout = buildSurfaceLayout()
	const ids = Object.keys(layout.controls)
	assert.equal(ids.length, PANEL_BUTTONS.length + LCD_CELLS.length)
	const positions = new Set(Object.values(layout.controls).map((c) => `${c.row},${c.column}`))
	assert.equal(positions.size, ids.length)
})

test('maps stripe banks onto rows of 16', () => {
	// Confirmed on hardware: bank 15 is the lower stripe's bottom row, bank 14 the row above it
	assert.equal(findButton(0x15, 0)?.id, 'stripe2-row3-1')
	assert.equal(findButton(0x14, 1)?.id, 'stripe2-row2-2')
	assert.equal(findButton(0x23, 7)?.id, 'stripe2-row3-16')
	assert.equal(findButton(0x10, 0)?.id, 'stripe1-row1-1')
	assert.equal(findButton(0x37, 4)?.id, 'bank37-5')
	assert.equal(findButton(0x99, 0), undefined)
})
