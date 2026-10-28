export interface Rgb {
	r: number
	g: number
	b: number
}

/** Parse a Companion colour (`#rrggbb` or `rgb(r,g,b)`) into components. Unknown input is treated as off. */
export function parseColor(color: string | undefined): Rgb {
	if (!color) return { r: 0, g: 0, b: 0 }

	const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim())
	if (hex) {
		const n = parseInt(hex[1], 16)
		return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
	}

	const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim())
	if (rgb) {
		const clamp = (v: string) => Math.min(255, Math.max(0, parseInt(v, 10)))
		return { r: clamp(rgb[1]), g: clamp(rgb[2]), b: clamp(rgb[3]) }
	}

	return { r: 0, g: 0, b: 0 }
}

export function scaleColor(color: Rgb, brightnessPercent: number): Rgb {
	const f = Math.min(100, Math.max(0, brightnessPercent)) / 100
	return { r: Math.round(color.r * f), g: Math.round(color.g * f), b: Math.round(color.b * f) }
}
