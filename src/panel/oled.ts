import { FONT_DATA, FONT_FIRST, FONT_HEIGHT, FONT_WIDTH } from './font8x16.ts'
import { OLED_BYTES } from './protocol.ts'

const OLED_WIDTH = 128
const OLED_HEIGHT = 64

/** Split text into lines no wider than `width`, breaking at spaces where possible */
export function wrapText(text: string, width: number): string[] {
	const lines: string[] = []
	for (const paragraph of text.replace(/\r/g, '').split('\n')) {
		let line = ''
		for (const word of paragraph.split(' ').filter(Boolean)) {
			let rest = word
			while (rest.length > 0) {
				const sep = line ? ' ' : ''
				if (line.length + sep.length + rest.length <= width) {
					line += sep + rest
					rest = ''
				} else if (line) {
					lines.push(line)
					line = ''
				} else {
					lines.push(rest.slice(0, width))
					rest = rest.slice(width)
				}
			}
		}
		lines.push(line)
	}
	while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
	return lines
}

/**
 * Draw text centred on one of the small 128x64 displays, as a bitmap in SSD1306 page order
 * (8 rows of 8 pixels, one byte per column, lowest bit at the top).
 * Short text (2 lines of up to 8 characters) is drawn double size.
 */
export function textToOled(text: string | undefined): Uint8Array {
	const out = new Uint8Array(OLED_BYTES)
	const clean = (text ?? '').trim()
	if (!clean) return out

	const big = wrapText(clean, OLED_WIDTH / (FONT_WIDTH * 2))
	const scale = big.length <= OLED_HEIGHT / (FONT_HEIGHT * 2) ? 2 : 1
	const lines = (scale === 2 ? big : wrapText(clean, OLED_WIDTH / FONT_WIDTH)).slice(0, OLED_HEIGHT / (FONT_HEIGHT * scale))

	const charW = FONT_WIDTH * scale
	const lineH = FONT_HEIGHT * scale
	const top = Math.floor((OLED_HEIGHT - lines.length * lineH) / 2)
	lines.forEach((line, row) => {
		const left = Math.floor((OLED_WIDTH - line.length * charW) / 2)
		for (let i = 0; i < line.length; i++) {
			let code = line.charCodeAt(i)
			if (code < FONT_FIRST || code > 126) code = 63 // '?'
			const glyph = (code - FONT_FIRST) * FONT_HEIGHT
			for (let gy = 0; gy < FONT_HEIGHT; gy++) {
				const bits = FONT_DATA[glyph + gy]
				for (let gx = 0; gx < FONT_WIDTH; gx++) {
					if (!(bits & (0x80 >> gx))) continue
					for (let sy = 0; sy < scale; sy++) {
						for (let sx = 0; sx < scale; sx++) {
							const x = left + i * charW + gx * scale + sx
							const y = top + row * lineH + gy * scale + sy
							if (x < 0 || x >= OLED_WIDTH || y < 0 || y >= OLED_HEIGHT) continue
							out[(y >> 3) * OLED_WIDTH + x] |= 1 << (y & 7)
						}
					}
				}
			}
		}
	})
	return out
}
