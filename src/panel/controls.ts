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

/** Banks in the right-hand section (transitions, keyers, delegates, media players) */
const OTHER_BANKS = [0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47]

/**
 * Right-hand buttons mapped from a press log on hardware: [id, bank, bit, row, column].
 * Rows 8-11 are the light grey transition area (upper T-bar), rows 12-15 the dark grey one,
 * and columns 9-15 the delegate, layer and media player buttons, roughly as they sit on the panel.
 * The KNOB bits fire when a rate knob is turned or pressed; their exact meaning is unconfirmed.
 */
const MAPPED_BUTTONS: ReadonlyArray<readonly [string, number, number, number, number]> = [
	['atem-bkgd', 0x35, 0, 8, 0],
	['atem-key1', 0x35, 1, 8, 1],
	['atem-key2', 0x35, 2, 8, 2],
	['atem-key3', 0x35, 3, 8, 3],
	['atem-key4', 0x35, 4, 8, 4],
	['atem-fade', 0x35, 5, 9, 0],
	['atem-trans', 0x35, 6, 9, 1],
	['atem-ftb', 0x35, 7, 9, 2],
	['atem-effect', 0x36, 0, 10, 0],
	['atem-knob-1', 0x30, 0, 10, 1],
	['atem-knob-2', 0x30, 1, 10, 2],
	['atem-knob-3', 0x30, 2, 10, 3],
	['atem-knob-4', 0x30, 3, 10, 4],
	['atem-take', 0x36, 1, 11, 0],
	['atem-auto', 0x36, 2, 11, 1],
	['atem-key1-take', 0x41, 4, 8, 6],
	['atem-key1-auto', 0x41, 5, 8, 7],
	['atem-key2-take', 0x41, 2, 9, 6],
	['atem-key2-auto', 0x41, 3, 9, 7],
	['atem-key3-take', 0x41, 0, 10, 6],
	['atem-key3-auto', 0x41, 1, 10, 7],
	['atem-key4-take', 0x40, 6, 11, 6],
	['atem-key4-auto', 0x40, 7, 11, 7],
	['vmix-bkgd', 0x36, 3, 12, 0],
	['vmix-key1', 0x36, 4, 12, 1],
	['vmix-key2', 0x36, 5, 12, 2],
	['vmix-key3', 0x36, 6, 12, 3],
	['vmix-key4', 0x36, 7, 12, 4],
	['vmix-fade', 0x37, 0, 13, 0],
	['vmix-trans', 0x37, 1, 13, 1],
	['vmix-ftb', 0x37, 2, 13, 2],
	['vmix-effect', 0x37, 3, 14, 0],
	['vmix-knob-1', 0x32, 4, 14, 1],
	['vmix-knob-2', 0x32, 5, 14, 2],
	['vmix-knob-3', 0x32, 6, 14, 3],
	['vmix-knob-4', 0x32, 7, 14, 4],
	['vmix-take', 0x37, 4, 15, 0],
	['vmix-auto', 0x37, 5, 15, 1],
	['vmix-extra-1', 0x41, 6, 15, 3],
	['vmix-extra-2', 0x41, 7, 15, 4],
	['vmix-key1-take', 0x40, 4, 12, 6],
	['vmix-key1-auto', 0x40, 5, 12, 7],
	['vmix-key2-take', 0x40, 2, 13, 6],
	['vmix-key2-auto', 0x40, 3, 13, 7],
	['vmix-key3-take', 0x40, 0, 14, 6],
	['vmix-key3-auto', 0x40, 1, 14, 7],
	['vmix-key4-take', 0x37, 6, 15, 6],
	['vmix-key4-auto', 0x37, 7, 15, 7],
	['me-1', 0x42, 0, 8, 9],
	['me-2', 0x42, 1, 8, 10],
	['me-3', 0x42, 2, 8, 11],
	['me-4', 0x42, 3, 8, 12],
	['follow-stripe', 0x42, 4, 8, 13],
	['me-5', 0x42, 5, 9, 9],
	['me-6', 0x42, 6, 9, 10],
	['me-7', 0x42, 7, 9, 11],
	['me-8', 0x43, 0, 9, 12],
	['main', 0x43, 1, 10, 9],
	['main-2', 0x43, 2, 10, 10],
	['main-3', 0x43, 3, 10, 11],
	['pos-scale', 0x43, 4, 11, 9],
	['pot', 0x43, 5, 11, 10],
	['crop', 0x43, 6, 11, 11],
	['focus', 0x43, 7, 11, 12],
	['shuttle', 0x44, 0, 12, 9],
	['reset', 0x44, 1, 12, 10],
	['lvset', 0x45, 2, 12, 14],
	['layer-a', 0x44, 2, 8, 14],
	['layer-b', 0x44, 3, 8, 15],
	['layer-c', 0x44, 4, 9, 14],
	['layer-d', 0x44, 5, 9, 15],
	['layer-1', 0x44, 6, 10, 14],
	['layer-2', 0x44, 7, 10, 15],
	['layer-3', 0x45, 0, 11, 14],
	['layer-4', 0x45, 1, 11, 15],
	['media-1', 0x45, 3, 13, 9],
	['media-2', 0x45, 4, 13, 10],
	['media-3', 0x45, 5, 13, 11],
	['media-4', 0x45, 6, 13, 12],
	['sound', 0x45, 7, 13, 13],
	['preset-prev', 0x46, 0, 13, 14],
	['preset-next', 0x46, 1, 13, 15],
	['mark-in', 0x46, 4, 14, 9],
	['mark-out', 0x46, 5, 14, 10],
	['loop', 0x47, 0, 14, 12],
	['playlist', 0x47, 1, 14, 13],
	['show', 0x47, 6, 14, 14],
	['autoplay', 0x47, 7, 14, 15],
	['transport-1', 0x46, 6, 15, 9],
	['transport-2', 0x46, 7, 15, 10],
	['transport-3', 0x46, 2, 15, 11],
	['transport-4', 0x46, 3, 15, 12],
]

const STRIPE_HEIGHT = 4 // button row, LCD, button row, button row
const OTHER_START_ROW = STRIPES.length * STRIPE_HEIGHT
/** Bits seen in no press yet go below the mapped area, 16 per row */
const UNMAPPED_START_ROW = OTHER_START_ROW + 8

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
	for (const [id, bank, bit, row, column] of MAPPED_BUTTONS) buttons.push({ id, bank, bit, row, column })
	const mapped = new Set(MAPPED_BUTTONS.map(([, bank, bit]) => bank * 8 + bit))
	let unmapped = 0
	for (const bank of OTHER_BANKS) {
		for (let bit = 0; bit < 8; bit++) {
			if (mapped.has(bank * 8 + bit)) continue
			buttons.push({
				id: `bank${bank.toString(16)}-${bit + 1}`,
				bank,
				bit,
				row: UNMAPPED_START_ROW + Math.floor(unmapped / 16),
				column: unmapped % 16,
			})
			unmapped++
		}
	}
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

/** The LCD in the media player area, between MARK OUT and LOOP */
export const AUX_LCD = { id: 'media-lcd', row: OTHER_START_ROW + 6, column: 11 }
export const LCD_CELLS = buildLcdCells()

const buttonsByBankBit = new Map(PANEL_BUTTONS.map((b) => [b.bank * 8 + b.bit, b]))
export function findButton(bank: number, bit: number): PanelButton | undefined {
	return buttonsByBankBit.get(bank * 8 + bit)
}

/** Analog controls, reported to Companion as input variables */
export const ANALOG_INPUTS = [
	{ id: 'tbar1', name: 'T-Bar 1 position (0 to 1)' },
	{ id: 'tbar2', name: 'T-Bar 2 position (0 to 1)' },
	// The same positions scaled for vMix "Set t-bar position" (0-255) and ATEM "Set TBar position" (0-100)
	{ id: 'tbar1_255', name: 'T-Bar 1 position (0 to 255)' },
	{ id: 'tbar1_100', name: 'T-Bar 1 position (0 to 100)' },
	{ id: 'tbar2_255', name: 'T-Bar 2 position (0 to 255)' },
	{ id: 'tbar2_100', name: 'T-Bar 2 position (0 to 100)' },
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
