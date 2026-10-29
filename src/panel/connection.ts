import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { hostname } from 'node:os'
import { Socket } from 'node:net'
import type { AnalogInputId } from './controls.ts'
import {
	AUX_DISPLAY,
	CONTROL_PORT,
	encodeHandshake,
	encodeLcd,
	encodeLeds,
	encodeOled,
	encodeTbarLight,
	GOODBYE,
	KEEPALIVE,
	LCD_COUNT,
	LED_BANKS,
	OLED_BYTES,
	OLED_COUNT,
	parsePanelLine,
} from './protocol.ts'

export interface PanelConnectionEvents {
	disconnected: [error: Error]
	buttonDown: [bank: number, bit: number]
	buttonUp: [bank: number, bit: number]
	analog: [inputId: AnalogInputId, value: number]
}

const KEEPALIVE_INTERVAL_MS = 5000
/** The panel sends a heartbeat every 750 ms, so this much silence means it is gone */
const SILENCE_TIMEOUT_MS = 5000
const CONNECT_TIMEOUT_MS = 5000

/** A stable id we claim the panel with, so it shows the same owner after a restart */
function defaultOwnerId(): string {
	return createHash('sha1').update(`companion-2stripe:${hostname()}`).digest('hex').slice(0, 12)
}

/**
 * A live link to one 2-Stripe panel over its TCP control port.
 */
export class TwoStripeConnection extends EventEmitter<PanelConnectionEvents> {
	readonly host: string
	readonly port: number
	readonly ownerId: string

	#socket: Socket | null = null
	#rxBuffer = ''
	#pressed = new Map<number, number>()
	#keepaliveTimer: NodeJS.Timeout | null = null
	#silenceTimer: NodeJS.Timeout | null = null
	#closing = false
	/** Owner id the panel last reported, if another controller (such as a TriCaster) holds it */
	otherOwner: string | null = null

	constructor(host: string, port = CONTROL_PORT, ownerId = defaultOwnerId()) {
		super()
		this.host = host
		this.port = port
		this.ownerId = ownerId
	}

	/** Connect and claim the panel. Resolves once the panel has answered. */
	async connect(): Promise<void> {
		const socket = new Socket()
		socket.setNoDelay(true)
		socket.setEncoding('latin1')
		this.#socket = socket

		await new Promise<void>((resolve, reject) => {
			const fail = (err: Error) => {
				clearTimeout(timer)
				socket.destroy()
				reject(err)
			}
			const timer = setTimeout(
				() => fail(new Error(`No reply from 2-Stripe panel at ${this.host}:${this.port}`)),
				CONNECT_TIMEOUT_MS,
			)
			socket.once('error', fail)
			socket.once('data', () => {
				clearTimeout(timer)
				socket.off('error', fail)
				resolve()
			})
			socket.connect(this.port, this.host, () => {
				this.#sendLines(encodeHandshake(this.ownerId))
				this.#resetPanel()
			})
			socket.on('data', (chunk: string) => this.#onData(chunk))
		})

		socket.on('error', (err) => this.#fail(err))
		socket.on('close', () => this.#fail(new Error('Connection to 2-Stripe panel closed')))
		this.#keepaliveTimer = setInterval(() => this.#sendLines([KEEPALIVE]), KEEPALIVE_INTERVAL_MS)
		this.#touch()
	}

	async close(): Promise<void> {
		if (this.#closing) return
		this.#closing = true
		this.#stopTimers()
		const socket = this.#socket
		if (!socket || socket.destroyed) return

		this.#resetPanel()
		this.#sendLines(GOODBYE)
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				socket.destroy()
				resolve()
			}, 500)
			socket.end(() => {
				clearTimeout(timer)
				resolve()
			})
		})
	}

	/** Set which buttons in a bank are lit (bit 0 = leftmost) */
	setLeds(bank: number, lit: number): void {
		this.#sendLines([encodeLeds(bank, lit)])
	}

	/** Write one line of an LCD (1-4) */
	setLcdLine(display: number, text: string): void {
		this.#sendLines([encodeLcd(display, text)])
	}

	setTbarLight(index: 1 | 2, r: number, g: number, b: number): void {
		this.#sendLines([encodeTbarLight(index, r, g, b)])
	}

	/** Turn off every light and clear every display */
	#resetPanel(): void {
		const lines: string[] = []
		for (let i = 1; i <= OLED_COUNT; i++) lines.push(encodeOled(i, new Uint8Array(OLED_BYTES)))
		for (let i = 1; i <= LCD_COUNT; i++) lines.push(encodeLcd(i, ''))
		lines.push(encodeLcd(AUX_DISPLAY, ''))
		for (const bank of LED_BANKS) lines.push(encodeLeds(bank, 0))
		lines.push(encodeTbarLight(1, 0, 0, 0), encodeTbarLight(2, 0, 0, 0))
		this.#sendLines(lines)
	}

	#sendLines(lines: string[]): void {
		const socket = this.#socket
		if (!socket || socket.destroyed || !socket.writable) return
		socket.write(lines.map((l) => `${l}\r`).join(''), 'latin1')
	}

	#onData(chunk: string): void {
		this.#touch()
		this.#rxBuffer += chunk
		let idx: number
		while ((idx = this.#rxBuffer.indexOf('\r')) !== -1) {
			const line = this.#rxBuffer.slice(0, idx).replace(/\n/g, '').trim()
			this.#rxBuffer = this.#rxBuffer.slice(idx + 1)
			if (line) this.#onLine(line)
		}
		// Guard against a peer that never sends a line ending
		if (this.#rxBuffer.length > 4096) this.#rxBuffer = ''
	}

	#onLine(line: string): void {
		const msg = parsePanelLine(line)
		switch (msg.type) {
			case 'buttons': {
				const before = this.#pressed.get(msg.bank) ?? 0
				this.#pressed.set(msg.bank, msg.pressed)
				const changed = before ^ msg.pressed
				for (let bit = 0; bit < 8; bit++) {
					if (!(changed & (1 << bit))) continue
					this.emit(msg.pressed & (1 << bit) ? 'buttonDown' : 'buttonUp', msg.bank, bit)
				}
				break
			}
			case 'tbar':
				this.emit('analog', msg.index === 1 ? 'tbar1' : 'tbar2', msg.value)
				break
			case 'joystick':
				this.emit('analog', 'joystick_x', msg.x)
				this.emit('analog', 'joystick_y', msg.y)
				this.emit('analog', 'joystick_z', msg.z)
				break
			case 'owner':
				this.otherOwner = /^0+$/.test(msg.id) || msg.id === this.ownerId ? null : msg.id
				break
			case 'goodbye':
				this.#fail(new Error('2-Stripe panel ended the session'))
				break
			default:
				break
		}
	}

	#touch(): void {
		if (this.#silenceTimer) clearTimeout(this.#silenceTimer)
		if (this.#closing) return
		this.#silenceTimer = setTimeout(
			() => this.#fail(new Error('2-Stripe panel stopped responding')),
			SILENCE_TIMEOUT_MS,
		)
	}

	#stopTimers(): void {
		if (this.#keepaliveTimer) clearInterval(this.#keepaliveTimer)
		if (this.#silenceTimer) clearTimeout(this.#silenceTimer)
		this.#keepaliveTimer = null
		this.#silenceTimer = null
	}

	#fail(err: Error): void {
		if (this.#closing) return
		this.#closing = true
		this.#stopTimers()
		this.#socket?.destroy()
		this.emit('disconnected', err)
	}
}
