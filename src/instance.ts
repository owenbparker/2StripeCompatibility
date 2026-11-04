import type { CardGenerator, SurfaceContext, SurfaceDrawProps, SurfaceInstance } from '@companion-surface/base'
import { parseColor } from './panel/color.ts'
import type { TwoStripeConnection } from './panel/connection.ts'
import { AUX_LCD, findButton, LCD_CELLS, lcdDisplaysForStripe, OLEDS, PANEL_BUTTONS } from './panel/controls.ts'
import { textToOled } from './panel/oled.ts'
import { LcdBuffer, textToDisplay } from './panel/lcd.ts'
import { AUX_DISPLAY } from './panel/protocol.ts'
import { parseSwitcherConfig, SwitcherLinks } from './switchers.ts'

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
	/**
	 * Text for each LCD column, per stripe. A column shows the text of its LCD-row control if it has any,
	 * otherwise the text of the button directly under the LCD.
	 */
	readonly #lcdText = { 1: new Array<string>(16).fill(''), 2: new Array<string>(16).fill('') }
	readonly #belowText = { 1: new Array<string>(16).fill(''), 2: new Array<string>(16).fill('') }
	/** Direct links to vMix and the ATEM for the T-bars, set up from the surface's settings */
	readonly #switchers = new SwitcherLinks()

	constructor(surfaceId: string, panel: TwoStripeConnection, context: SurfaceContext) {
		this.surfaceId = surfaceId
		this.#panel = panel

		panel.on('buttonDown', (bank, bit) => {
			const button = findButton(bank, bit)
			// Logged so buttons can be located from Companion's log while mapping the panel
			console.warn(`2-Stripe press: ${button?.id ?? 'unmapped'} (bank ${bank.toString(16)} bit ${bit})`)
			if (button) context.keyDownById(button.id)
			// The T-bars follow the mix / M/E picked with the 1-4 buttons above each transition area
			const select = /^(upper|lower)-mix-([1-4])$/.exec(button?.id ?? '')
			if (select) {
				const n = Number(select[2])
				if (select[1] === 'upper') this.#switchers.selectVmixMix(n)
				else this.#switchers.selectAtemMe(n)
			}
		})
		panel.on('buttonUp', (bank, bit) => {
			const button = findButton(bank, bit)
			if (button) context.keyUpById(button.id)
		})
		panel.on('analog', (id, value) => {
			context.sendVariableValue(id, value)
			if (id === 'tbar1' || id === 'tbar2') {
				this.#switchers.tbar(id, value)
				context.sendVariableValue(`${id}_255`, Math.round(value * 255))
				context.sendVariableValue(`${id}_100`, Math.round(value * 100))
			}
		})
		panel.on('disconnected', (err) => context.disconnect(err))
	}

	async init(): Promise<void> {}

	async updateConfig(config: Record<string, unknown>): Promise<void> {
		this.#switchers.update(parseSwitcherConfig(config))
	}

	async close(): Promise<void> {
		this.#switchers.close()
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
			this.#lcdText[stripe].fill('')
			this.#belowText[stripe].fill('')
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
			// The row directly under the LCD labels it
			if (button.stripe && button.stripeRow === 2) {
				this.#belowText[button.stripe][button.column] = drawProps.text ?? ''
				this.#updateLcdCell(button.stripe, button.column)
			}
			return
		}

		if (drawProps.controlId === AUX_LCD.id) {
			this.#panel.setLcdLine(AUX_DISPLAY, textToDisplay(drawProps.text))
			return
		}

		const oled = OLEDS.find((o) => o.id === drawProps.controlId)
		if (oled) {
			this.#panel.setOled(oled.index, textToOled(drawProps.text))
			return
		}

		const cell = lcdCellsById.get(drawProps.controlId)
		if (cell) {
			this.#lcdText[cell.stripe][cell.index] = drawProps.text ?? ''
			this.#updateLcdCell(cell.stripe, cell.index)
		}
	}

	#updateLcdCell(stripe: 1 | 2, index: number): void {
		const own = this.#lcdText[stripe][index]
		const text = own.trim() ? own : this.#belowText[stripe][index]
		if (this.#lcds[stripe].setCell(index, text)) this.#flushLcd(stripe)
	}

	async showStatus(_signal: AbortSignal, _cardGenerator: CardGenerator, statusMessage: string): Promise<void> {
		await this.blank()
		this.#panel.setLcdLine(lcdDisplaysForStripe(1)[0], statusMessage)
	}

	#flushLcd(stripe: 1 | 2): void {
		const [left, right] = this.#lcds[stripe].displays()
		const [leftDisplay, rightDisplay] = lcdDisplaysForStripe(stripe)
		this.#panel.setLcdLine(leftDisplay, left)
		this.#panel.setLcdLine(rightDisplay, right)
	}
}
