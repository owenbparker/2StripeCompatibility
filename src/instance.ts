import type { CardGenerator, SurfaceContext, SurfaceDrawProps, SurfaceInstance } from '@companion-surface/base'
import { parseColor } from './panel/color.ts'
import type { TwoStripeConnection } from './panel/connection.ts'
import { findButton, LCD_CELLS, lcdLinesForStripe, PANEL_BUTTONS } from './panel/controls.ts'
import { LcdBuffer } from './panel/lcd.ts'

const buttonsById = new Map(PANEL_BUTTONS.map((b) => [b.id, b]))
const lcdCellsById = new Map(LCD_CELLS.map((c) => [c.id, c]))

/** A button is lit when its Companion colour is anything brighter than near-black */
const LIT_THRESHOLD = 40

export class TwoStripeSurface implements SurfaceInstance {
	readonly surfaceId: string
	readonly productName = 'TriCaster 2-Stripe'

	readonly #panel: TwoStripeConnection
	readonly #leds = new Map<number, number>()
	readonly #lcds = { 1: new LcdBuffer(), 2: new LcdBuffer() }

	constructor(surfaceId: string, panel: TwoStripeConnection, context: SurfaceContext) {
		this.surfaceId = surfaceId
		this.#panel = panel

		panel.on('buttonDown', (bank, bit) => {
			const button = findButton(bank, bit)
			if (button) context.keyDownById(button.id)
		})
		panel.on('buttonUp', (bank, bit) => {
			const button = findButton(bank, bit)
			if (button) context.keyUpById(button.id)
		})
		panel.on('analog', (id, value) => context.sendVariableValue(id, value))
		panel.on('disconnected', (err) => context.disconnect(err))
	}

	async init(): Promise<void> {}

	async close(): Promise<void> {
		await this.#panel.close()
	}

	async ready(): Promise<void> {}

	async setBrightness(_percent: number): Promise<void> {
		// The panel's brightness command has not been identified yet
	}

	async blank(): Promise<void> {
		for (const bank of new Set(PANEL_BUTTONS.map((b) => b.bank))) {
			this.#leds.set(bank, 0)
			this.#panel.setLeds(bank, 0)
		}
		for (const stripe of [1, 2] as const) {
			this.#lcds[stripe].clear()
			this.#flushLcd(stripe)
		}
	}

	async draw(_signal: AbortSignal, drawProps: SurfaceDrawProps): Promise<void> {
		const button = buttonsById.get(drawProps.controlId)
		if (button) {
			const { r, g, b } = parseColor(drawProps.color)
			const lit = Math.max(r, g, b) >= LIT_THRESHOLD
			const before = this.#leds.get(button.bank) ?? 0
			const after = lit ? before | (1 << button.bit) : before & ~(1 << button.bit)
			if (after !== before) {
				this.#leds.set(button.bank, after)
				this.#panel.setLeds(button.bank, after)
			}
			return
		}

		const cell = lcdCellsById.get(drawProps.controlId)
		if (cell && this.#lcds[cell.stripe].setCell(cell.index, drawProps.text)) {
			this.#flushLcd(cell.stripe)
		}
	}

	async showStatus(_signal: AbortSignal, _cardGenerator: CardGenerator, statusMessage: string): Promise<void> {
		await this.blank()
		this.#panel.setLcdLine(lcdLinesForStripe(1)[0], statusMessage)
	}

	#flushLcd(stripe: 1 | 2): void {
		const [top, bottom] = this.#lcds[stripe].lines()
		const [topLine, bottomLine] = lcdLinesForStripe(stripe)
		this.#panel.setLcdLine(topLine, top)
		this.#panel.setLcdLine(bottomLine, bottom)
	}
}
