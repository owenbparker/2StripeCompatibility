import { EventEmitter } from 'node:events'
import type { Rgb } from './color.ts'
import type { AnalogInputId } from './controls.ts'

export interface PanelConnectionEvents {
	connected: []
	disconnected: [error: Error]
	buttonDown: [controlId: string]
	buttonUp: [controlId: string]
	analog: [inputId: AnalogInputId, value: number]
}

/**
 * A live link to one physical 2-Stripe panel.
 * Everything protocol-specific lives behind this interface, so the Companion side does not change
 * once the wire protocol is decoded.
 */
export interface PanelConnection extends EventEmitter<PanelConnectionEvents> {
	readonly host: string
	/** Stable identifier for the panel, ideally its serial number or MAC address */
	readonly serial: string

	connect(): Promise<void>
	close(): Promise<void>
	setButtonColor(controlId: string, color: Rgb): void
	clearAll(): void
}

export class ProtocolNotDecodedError extends Error {
	constructor() {
		super('The 2-Stripe network protocol has not been decoded yet. A packet capture of the panel is needed.')
	}
}

/**
 * Placeholder until the protocol is known. It fails to connect with a clear message rather than
 * pretending to work.
 */
export class TwoStripeConnection extends EventEmitter<PanelConnectionEvents> implements PanelConnection {
	readonly host: string
	readonly serial: string

	constructor(host: string) {
		super()
		this.host = host
		this.serial = `2stripe-${host}`
	}

	async connect(): Promise<void> {
		throw new ProtocolNotDecodedError()
	}

	async close(): Promise<void> {}

	setButtonColor(_controlId: string, _color: Rgb): void {}

	clearAll(): void {}
}
