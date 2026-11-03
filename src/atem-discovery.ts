import { createSocket, type Socket } from 'node:dgram'
import { EventEmitter } from 'node:events'
import { networkInterfaces } from 'node:os'

const MDNS_ADDRESS = '224.0.0.251'
const MDNS_PORT = 5353
/** How often to ask while nothing has answered yet, then once one has */
const SEARCH_INTERVAL_MS = 5000
const RECHECK_INTERVAL_MS = 30000

/** Encode a DNS name like _blackmagic._tcp.local */
function encodeName(name: string): Buffer {
	const parts = name.split('.').map((label) => {
		const b = Buffer.from(label, 'ascii')
		return Buffer.concat([Buffer.from([b.length]), b])
	})
	return Buffer.concat([...parts, Buffer.from([0])])
}

/** An mDNS question for the two services an ATEM advertises (the same ones the ATEM connection searches for) */
export function buildAtemQuery(): Buffer {
	const header = Buffer.alloc(12)
	header.writeUInt16BE(2, 4) // two questions
	const question = (name: string) => Buffer.concat([encodeName(name), Buffer.from([0x00, 0x0c, 0x00, 0x01])]) // PTR, IN
	return Buffer.concat([header, question('_blackmagic._tcp.local'), question('_switcher_ctrl._udp.local')])
}

/**
 * Whether an mDNS packet is an ATEM announcing itself. Only answers count (not other computers asking),
 * and they must name the ATEM control service or carry the AtemSwitcher class that Blackmagic devices advertise.
 */
export function isAtemAnswer(msg: Buffer): boolean {
	if (msg.length < 12 || !(msg.readUInt16BE(2) & 0x8000)) return false
	const text = msg.toString('latin1')
	return text.includes('class=AtemSwitcher') || text.includes('_switcher_ctrl')
}

export interface AtemDiscoveryEvents {
	found: [address: string]
}

/**
 * Finds ATEM switchers on the network over mDNS (Bonjour), like the ATEM connection's device list does,
 * so the T-bar works without typing the switcher's address.
 */
export class AtemDiscovery extends EventEmitter<AtemDiscoveryEvents> {
	#socket: Socket | null = null
	#timer: NodeJS.Timeout | null = null
	#restartTimer: NodeJS.Timeout | null = null
	#stopped = false
	readonly found = new Set<string>()

	start(): void {
		this.#stopped = false
		const socket = createSocket({ type: 'udp4', reuseAddr: true })
		this.#socket = socket
		socket.on('message', (msg, rinfo) => {
			if (!isAtemAnswer(msg) || this.found.has(rinfo.address)) return
			this.found.add(rinfo.address)
			console.log(`2-Stripe found an ATEM at ${rinfo.address}`)
			this.emit('found', rinfo.address)
		})
		socket.on('error', (err) => {
			console.warn(`2-Stripe ATEM search: ${err.message}`)
			this.#restart()
		})
		socket.bind(MDNS_PORT, () => {
			for (const address of ipv4Addresses()) {
				try {
					socket.addMembership(MDNS_ADDRESS, address)
				} catch {
					// Already joined on this interface, or it can't do multicast
				}
			}
			socket.setMulticastTTL(255)
			this.#ask()
		})
	}

	stop(): void {
		this.#stopped = true
		this.#clearTimers()
		this.#socket?.close()
		this.#socket = null
	}

	#ask(): void {
		const socket = this.#socket
		if (!socket) return
		const query = buildAtemQuery()
		for (const address of ipv4Addresses()) {
			// Ask on every network card, since the ATEM may not be on the default one
			try {
				socket.setMulticastInterface(address)
				socket.send(query, MDNS_PORT, MDNS_ADDRESS, () => {})
			} catch {
				// Interface went away; the next round tries again
			}
		}
		this.#timer = setTimeout(() => this.#ask(), this.found.size ? RECHECK_INTERVAL_MS : SEARCH_INTERVAL_MS)
	}

	#restart(): void {
		this.#clearTimers()
		try {
			this.#socket?.close()
		} catch {
			// Already closed
		}
		this.#socket = null
		if (this.#stopped) return
		this.#restartTimer = setTimeout(() => this.start(), 5000)
	}

	#clearTimers(): void {
		if (this.#timer) clearTimeout(this.#timer)
		if (this.#restartTimer) clearTimeout(this.#restartTimer)
		this.#timer = this.#restartTimer = null
	}
}

function ipv4Addresses(): string[] {
	return Object.values(networkInterfaces())
		.flat()
		.filter((i) => i && i.family === 'IPv4' && !i.internal)
		.map((i) => i!.address)
}
