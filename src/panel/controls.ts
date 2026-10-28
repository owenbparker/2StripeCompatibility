import type { SurfaceSchemaLayoutDefinition } from '@companion-surface/base'

/**
 * A physical control on the panel that Companion treats as a button.
 * `row`/`column` place it on the Companion grid.
 */
export interface PanelButton {
	id: string
	row: number
	column: number
}

/**
 * PROVISIONAL: the real button list comes from decoding a packet capture of the panel.
 * Until then this models two stripes, each with a Program and Preview row.
 */
const BUTTONS_PER_ROW = 10
const ROWS = ['stripe1-pgm', 'stripe1-pvw', 'stripe2-pgm', 'stripe2-pvw']

export const PANEL_BUTTONS: PanelButton[] = ROWS.flatMap((rowName, row) =>
	Array.from({ length: BUTTONS_PER_ROW }, (_, column) => ({
		id: `${rowName}-${column + 1}`,
		row,
		column,
	})),
)

/** Analog controls, reported to Companion as input variables */
export const ANALOG_INPUTS = [
	{ id: 'tbar', name: 'T-Bar position (0-1)' },
	{ id: 'joystick_x', name: 'Joystick X (-1 to 1)' },
	{ id: 'joystick_y', name: 'Joystick Y (-1 to 1)' },
	{ id: 'joystick_z', name: 'Joystick twist (-1 to 1)' },
] as const

export type AnalogInputId = (typeof ANALOG_INPUTS)[number]['id']

export function buildSurfaceLayout(): SurfaceSchemaLayoutDefinition {
	return {
		stylePresets: {
			// The panel's buttons are lit, not displays, so only a colour is needed
			default: { colors: 'hex' },
		},
		controls: Object.fromEntries(PANEL_BUTTONS.map((b) => [b.id, { row: b.row, column: b.column }])),
	}
}
