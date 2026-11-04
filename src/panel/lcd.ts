import { wrapText } from './oled.ts'
import { LCD_WIDTH } from './protocol.ts'

export const CELL_WIDTH = 5
export const CELL_COUNT = LCD_WIDTH / CELL_WIDTH

/** Characters of text per cell line. The fifth character is always a space, so neighbouring labels don't run together. */
export const CELL_TEXT_WIDTH = CELL_WIDTH - 1

/** Split button text into the two lines of one LCD cell, breaking at a space where possible */
export function textToCellLines(text: string | undefined): [string, string] {
	const lines = wrapText((text ?? '').trim(), CELL_TEXT_WIDTH)
	const fit = (s: string | undefined) => (s ?? '').slice(0, CELL_TEXT_WIDTH).padEnd(CELL_WIDTH)
	return [fit(lines[0]), fit(lines[1])]
}

/**
 * Holds the text of one stripe's LCDs.
 * A stripe has two LCDs, one over columns 1-8 and one over 9-16. Each is 2 lines of 40 characters,
 * and the panel takes a whole LCD as one 80-character string: the top line, then the bottom line.
 */
export class LcdBuffer {
	readonly #cells: [string, string][] = Array.from({ length: CELL_COUNT }, () => [' '.repeat(CELL_WIDTH), ' '.repeat(CELL_WIDTH)])

	/** Returns true if the cell changed */
	setCell(index: number, text: string | undefined): boolean {
		const next = textToCellLines(text)
		const prev = this.#cells[index]
		if (prev[0] === next[0] && prev[1] === next[1]) return false
		this.#cells[index] = next
		return true
	}

	clear(): void {
		for (let i = 0; i < CELL_COUNT; i++) this.setCell(i, '')
	}

	/** The 80-character contents of the left LCD (columns 1-8) and the right LCD (columns 9-16) */
	displays(): [string, string] {
		const half = CELL_COUNT / 2
		const render = (cells: [string, string][]) => cells.map((c) => c[0]).join('') + cells.map((c) => c[1]).join('')
		return [render(this.#cells.slice(0, half)), render(this.#cells.slice(half))]
	}
}

/** Split text into the two 40-character lines of a single LCD, for the media player LCD */
export function textToDisplay(text: string | undefined): string {
	const width = LCD_WIDTH / 2
	const clean = (text ?? '').replace(/\r/g, '')
	const parts = clean.split('\n')
	const [first, second] = parts.length > 1 ? [parts[0], parts.slice(1).join(' ')] : [clean.slice(0, width), clean.slice(width)]
	const fit = (s: string) => s.trim().slice(0, width).padEnd(width)
	return fit(first) + fit(second)
}
