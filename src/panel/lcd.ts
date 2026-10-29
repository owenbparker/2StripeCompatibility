import { LCD_WIDTH } from './protocol.ts'

export const CELL_WIDTH = 5
export const CELL_COUNT = LCD_WIDTH / CELL_WIDTH

/** Split button text into the two 5-character lines of one LCD cell */
export function textToCellLines(text: string | undefined): [string, string] {
	const clean = (text ?? '').replace(/\r/g, '')
	const explicit = clean.split('\n')
	const [first, second] =
		explicit.length > 1 ? [explicit[0], explicit.slice(1).join(' ')] : [clean.slice(0, CELL_WIDTH), clean.slice(CELL_WIDTH)]
	const fit = (s: string) => s.trim().slice(0, CELL_WIDTH).padEnd(CELL_WIDTH)
	return [fit(first), fit(second)]
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
