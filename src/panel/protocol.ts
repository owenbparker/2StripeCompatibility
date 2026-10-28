/**
 * Encoding and decoding for the 2-Stripe panel's line protocol.
 * See docs/PROTOCOL.md for how this was worked out.
 *
 * Every message is ASCII terminated by a carriage return. Hex values are upper case.
 */

export const CONTROL_PORT = 23
export const DISCOVERY_PORT = 1901

/** Button banks the panel reports. Each holds up to 8 buttons as an active-low bitmask. */
export const INPUT_BANKS = [
	0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x20, 0x21, 0x22, 0x23, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36,
	0x37, 0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47,
] as const

/** LED banks the TriCaster resets on connect. 0x48 has no buttons that we have seen. */
export const LED_BANKS = [...INPUT_BANKS, 0x48]

export const LCD_COUNT = 4
export const LCD_WIDTH = 80
/** Extra text display that the TriCaster uses for a clock and comment */
export const AUX_DISPLAY = 7
export const OLED_COUNT = 2
export const OLED_BYTES = 1024 // 128x64, 1 bit per pixel

export type PanelMessage =
	| { type: 'heartbeat' }
	| { type: 'owner'; id: string }
	| { type: 'version'; version: string }
	| { type: 'keepalive' }
	| { type: 'goodbye' }
	| { type: 'buttons'; bank: number; pressed: number }
	| { type: 'tbar'; index: 1 | 2; value: number }
	| { type: 'joystick'; x: number; y: number; z: number }
	| { type: 'unknown'; line: string }

const hex2 = (n: number) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0')

/** Parse one line from the panel, without its line ending */
export function parsePanelLine(line: string): PanelMessage {
	if (line === 'K') return { type: 'keepalive' }
	if (line === 'k') return { type: 'goodbye' }
	if (/^CH\d+$/.test(line) || /^\|\d+$/.test(line)) return { type: 'heartbeat' }
	if (line.startsWith('?')) return { type: 'owner', id: line.slice(1) }
	if (line.startsWith('~')) return { type: 'version', version: line.slice(1) }

	let m = /^([1-4][0-9A-F])([0-9A-F]{2})$/i.exec(line)
	if (m) {
		// Bits are cleared while held, so invert to get a pressed mask
		return { type: 'buttons', bank: parseInt(m[1], 16), pressed: ~parseInt(m[2], 16) & 0xff }
	}

	m = /^([78])0([0-9A-F]{2})$/i.exec(line)
	if (m) return { type: 'tbar', index: m[1] === '7' ? 1 : 2, value: parseInt(m[2], 16) / 0xff }

	m = /^90([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(line)
	if (m) {
		const axis = (s: string) => Math.max(-1, Math.min(1, (parseInt(s, 16) - 0x80) / 0x7f))
		return { type: 'joystick', x: axis(m[1]), y: axis(m[2]), z: axis(m[3]) }
	}

	return { type: 'unknown', line }
}

/** Light the buttons in `lit` (bit 0 is the leftmost button in the bank) */
export function encodeLeds(bank: number, lit: number): string {
	return `${hex2(bank)}${hex2(~lit)}`
}

/** Set one full line of an LCD (1-4) or the aux display (7). Text is padded or cut to 80 characters. */
export function encodeLcd(display: number, text: string): string {
	const safe = text.replace(/[^\x20-\x7e]/g, ' ')
	return `L${display}00${hex2(LCD_WIDTH)}${safe.padEnd(LCD_WIDTH).slice(0, LCD_WIDTH)}`
}

/** Send a 128x64 bitmap in SSD1306 page order to OLED 1 or 2 */
export function encodeOled(index: number, data: Uint8Array): string {
	if (data.length !== OLED_BYTES) throw new Error(`OLED data must be ${OLED_BYTES} bytes`)
	return `O${index}${Buffer.from(data).toString('hex').toUpperCase()}`
}

/** Set the colour of the light on T-bar 1 or 2 */
export function encodeTbarLight(index: 1 | 2, r: number, g: number, b: number): string {
	return `${index === 1 ? '5' : '6'}0${hex2(r)}${hex2(g)}${hex2(b)}`
}

/**
 * What the TriCaster sends after connecting, in order.
 * The 1x config lines are replayed as captured; their meaning is not known yet.
 */
export function encodeHandshake(ownerId: string): string[] {
	return ['V', `Q${ownerId}`, 'K', 'T', '1A01', '1931', '1D00', '1EC8', '1C40']
}

/** What the TriCaster sends before disconnecting: reset, then goodbye */
export const GOODBYE = ['R', 'k']

export const KEEPALIVE = 'K'

/** Discovery probe for the panel's built-in USR-TCP232 network adapter */
export const DISCOVERY_PROBE = Buffer.from([0xff, 0x01, 0x01, 0x02])

export interface DiscoveryReply {
	ip: string
	mac: string
	model: string
}

export function parseDiscoveryReply(msg: Buffer): DiscoveryReply | null {
	// ff <len> 01 00 00 <ip x4> <mac x6> <2 bytes> 01 00 <model, null terminated> ...
	if (msg.length < 21 || msg[0] !== 0xff || msg[2] !== 0x01 || msg[1] !== msg.length) return null
	const ip = [...msg.subarray(5, 9)].join('.')
	const mac = [...msg.subarray(9, 15)].map((b) => b.toString(16).padStart(2, '0')).join(':')
	const end = msg.indexOf(0, 19)
	const model = msg.subarray(19, end === -1 ? msg.length - 1 : end).toString('latin1')
	return { ip, mac, model }
}
