import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSurfaceLayout, findButton, LCD_CELLS, PANEL_BUTTONS } from './controls.ts'

test('every control has a unique id and grid position', () => {
	const layout = buildSurfaceLayout()
	const ids = Object.keys(layout.controls)
	assert.equal(ids.length, PANEL_BUTTONS.length + LCD_CELLS.length + 1)
	const positions = new Set(Object.values(layout.controls).map((c) => `${c.row},${c.column}`))
	assert.equal(positions.size, ids.length)
})

test('maps stripe banks onto rows of 16', () => {
	// Confirmed on hardware: bank 15 is the lower stripe's bottom row, bank 14 the row above it
	assert.equal(findButton(0x15, 0)?.id, 'stripe2-row3-1')
	assert.equal(findButton(0x14, 1)?.id, 'stripe2-row2-2')
	assert.equal(findButton(0x23, 7)?.id, 'stripe2-row3-16')
	assert.equal(findButton(0x10, 0)?.id, 'stripe1-row1-1')
	assert.equal(findButton(0x37, 4)?.id, 'lower-take')
	assert.equal(findButton(0x31, 0)?.id, 'bank31-1')
	assert.equal(findButton(0x99, 0), undefined)
})

test('right-hand buttons sit where they are on the panel', () => {
	const at = (id: string) => {
		const b = PANEL_BUTTONS.find((b) => b.id === id)
		return b && [b.row, b.column]
	}
	assert.deepEqual(at('upper-bkgd'), [8, 0])
	assert.deepEqual(at('lower-auto'), [15, 1])
	assert.deepEqual(at('me-1'), [8, 9])
	assert.deepEqual(findButton(0x46, 2) && at(findButton(0x46, 2)!.id), [15, 11])
	assert.ok(PANEL_BUTTONS.filter((b) => b.bank >= 0x30).every((b) => b.row >= 8))
})
