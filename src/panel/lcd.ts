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

/** Holds the text of one stripe's LCD and renders its two 80-character lines */
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

	lines(): [string, string] {
		return [this.#cells.map((c) => c[0]).join(''), this.#cells.map((c) => c[1]).join('')]
	}
}
