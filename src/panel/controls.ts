import type { SurfaceSchemaLayoutDefinition } from '@companion-surface/base'

/** A physical button, addressed by its bank and bit in the panel protocol */
export interface PanelButton {
	id: string
	bank: number
	bit: number
	row: number
	column: number
	/** For stripe buttons: which stripe and which of its rows (1 = top) */
	stripe?: 1 | 2
	stripeRow?: 1 | 2 | 3
}

/** One cell of a blue LCD: 2 lines of 5 characters above a column of buttons */
export interface LcdCell {
	id: string
	stripe: 1 | 2
	/** 0-15, left to right */
	index: number
	row: number
	column: number
}

/**
 * Each stripe has three rows of 16 buttons (KEY, A/C, B/D), with an LCD between the first and second row.
 * A row is two banks: the left 8 buttons, then the right 8.
 * Stripe 1 is the upper stripe. Rows are listed top to bottom, as confirmed on hardware:
 * bank 15 is the lower stripe's PREV B/D row and bank 14 its PGM A/C row.
 */
const STRIPES = [
	{ stripe: 1, rows: [[0x10, 0x16], [0x11, 0x17], [0x12, 0x20]], lcdLines: [1, 3] },
	{ stripe: 2, rows: [[0x13, 0x21], [0x14, 0x22], [0x15, 0x23]], lcdLines: [2, 4] },
] as const

/** Protocol display numbers of a stripe's left (columns 1-8) and right (columns 9-16) LCDs, confirmed on hardware */
export function lcdDisplaysForStripe(stripe: 1 | 2): readonly [number, number] {
	return STRIPES[stripe - 1].lcdLines
}

/**
 * Banks in the right-hand section (transitions, keyers, delegates, joystick area).
 * Their physical positions are not mapped yet, so they are laid out two banks per row.
 */
const OTHER_BANKS = [0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47]

const STRIPE_HEIGHT = 4 // button row, LCD, button row, button row
const OTHER_START_ROW = STRIPES.length * STRIPE_HEIGHT

function buildButtons(): PanelButton[] {
	const buttons: PanelButton[] = []
	for (const { stripe, rows } of STRIPES) {
		rows.forEach((banks, rowIndex) => {
			// Leave a grid row for the LCD under the first button row
			const row = (stripe - 1) * STRIPE_HEIGHT + (rowIndex === 0 ? 0 : rowIndex + 1)
			banks.forEach((bank, half) => {
				for (let bit = 0; bit < 8; bit++) {
					const column = half * 8 + bit
					buttons.push({
						id: `stripe${stripe}-row${rowIndex + 1}-${column + 1}`,
						bank,
						bit,
						row,
						column,
						stripe,
						stripeRow: (rowIndex + 1) as 1 | 2 | 3,
					})
				}
			})
		})
	}
	OTHER_BANKS.forEach((bank, i) => {
		for (let bit = 0; bit < 8; bit++) {
			buttons.push({
				id: `bank${bank.toString(16)}-${bit + 1}`,
				bank,
				bit,
				row: OTHER_START_ROW + Math.floor(i / 2),
				column: (i % 2) * 8 + bit,
			})
		}
	})
	return buttons
}

function buildLcdCells(): LcdCell[] {
	return STRIPES.flatMap(({ stripe }) =>
		Array.from({ length: 16 }, (_, index) => ({
			id: `stripe${stripe}-lcd-${index + 1}`,
			stripe,
			index,
			row: (stripe - 1) * STRIPE_HEIGHT + 1,
			column: index,
		})),
	)
}

export const PANEL_BUTTONS = buildButtons()

/** The LCD in the media player area, shown as one text control under the right-hand banks */
export const AUX_LCD = { id: 'media-lcd', row: OTHER_START_ROW + OTHER_BANKS.length / 2, column: 0 }
export const LCD_CELLS = buildLcdCells()

const buttonsByBankBit = new Map(PANEL_BUTTONS.map((b) => [b.bank * 8 + b.bit, b]))
export function findButton(bank: number, bit: number): PanelButton | undefined {
	return buttonsByBankBit.get(bank * 8 + bit)
}

/** Analog controls, reported to Companion as input variables */
export const ANALOG_INPUTS = [
	{ id: 'tbar1', name: 'T-Bar 1 position (0 to 1)' },
	{ id: 'tbar2', name: 'T-Bar 2 position (0 to 1)' },
	{ id: 'joystick_x', name: 'Joystick X (-1 to 1)' },
	{ id: 'joystick_y', name: 'Joystick Y (-1 to 1)' },
	{ id: 'joystick_z', name: 'Joystick twist (-1 to 1)' },
] as const

export type AnalogInputId = (typeof ANALOG_INPUTS)[number]['id']

export function buildSurfaceLayout(): SurfaceSchemaLayoutDefinition {
	return {
		stylePresets: {
			// Buttons only have an on/off light. Their text is used to label the LCD above them.
			default: { colors: 'hex', text: true },
			lcd: { text: true },
		},
		controls: {
			...Object.fromEntries(PANEL_BUTTONS.map((b) => [b.id, { row: b.row, column: b.column }])),
			...Object.fromEntries(LCD_CELLS.map((c) => [c.id, { row: c.row, column: c.column, stylePreset: 'lcd' }])),
			[AUX_LCD.id]: { row: AUX_LCD.row, column: AUX_LCD.column, stylePreset: 'lcd' },
		},
	}
}
