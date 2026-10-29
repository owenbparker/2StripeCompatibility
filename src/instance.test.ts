import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { SurfaceContext } from '@companion-surface/base'
import { TwoStripeSurface } from './instance.ts'
import type { TwoStripeConnection } from './panel/connection.ts'

function setup() {
	const lcd = new Map<number, string>()
	const leds = new Map<number, number>()
	const panel = Object.assign(new EventEmitter(), {
		setLeds: (bank: number, lit: number) => leds.set(bank, lit),
		setLcdLine: (display: number, text: string) => lcd.set(display, text),
		close: async () => {},
	}) as unknown as TwoStripeConnection
	const surface = new TwoStripeSurface('test', panel, {} as SurfaceContext)
	const draw = (controlId: string, text: string, color = '#000000') =>
		surface.draw(new AbortController().signal, { controlId, text, color, pressed: false })
	return { lcd, leds, draw }
}

test('labels the LCD with the text of the button under it', async () => {
	const { lcd, draw } = setup()
	await draw('stripe2-row2-1', 'CAM1')
	assert.equal(lcd.get(2)?.slice(0, 5), 'CAM1 ')
})

test('text on the LCD row takes priority over the button under it', async () => {
	const { lcd, draw } = setup()
	await draw('stripe1-row2-3', 'CAM3')
	await draw('stripe1-lcd-3', 'WIDE\nSHOT')
	assert.equal(lcd.get(1)?.slice(10, 15), 'WIDE ')
	assert.equal(lcd.get(3)?.slice(10, 15), 'SHOT ')
	await draw('stripe1-lcd-3', '')
	assert.equal(lcd.get(1)?.slice(10, 15), 'CAM3 ')
})

test('lights a button from its colour', async () => {
	const { leds, draw } = setup()
	await draw('stripe2-row3-1', 'PREVIEW', '#00ff00')
	assert.equal(leds.get(0x15), 0b1)
	await draw('stripe2-row3-1', 'PREVIEW', '#000000')
	assert.equal(leds.get(0x15), 0)
})
