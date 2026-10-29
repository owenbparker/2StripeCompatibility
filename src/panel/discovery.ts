import { EventEmitter } from 'node:events'
import { createSocket, type Socket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { DISCOVERY_PORT, DISCOVERY_PROBE, parseDiscoveryReply, type DiscoveryReply } from './protocol.ts'

export interface DiscoveryEvents {
	found: [panel: DiscoveryReply]
	lost: [mac: string]
}

const PROBE_INTERVAL_MS = 10_000
const FORGET_AFTER_MS = 60_000
const FIRST_SEARCH_MS = 2000

/**
 * Finds panels by broadcasting the search packet understood by their built-in USR-TCP232 adapter.
 * Replies are broadcast back to the discovery port, so we listen on it too.
 */
export class PanelDiscovery extends EventEmitter<DiscoveryEvents> {
	#socket: Socket | null = null
	#timer: NodeJS.Timeout | null = null
	readonly #lastSeen = new Map<string, number>()
	readonly #byMac = new Map<string, DiscoveryReply>()

	/** Current address of a panel by MAC, if it has answered recently */
	ipForMac(mac: string): string | undefined {
		return this.#byMac.get(mac)?.ip
	}

	macForIp(ip: string): string | undefined {
		for (const panel of this.#byMac.values()) if (panel.ip === ip) return panel.mac
		return undefined
	}

	/** All panels that have answered recently */
	get panels(): DiscoveryReply[] {
		return [...this.#byMac.values()]
	}

	/** Resolves once the first search has had time to get answers */
	settled: Promise<void> = Promise.resolve()

	start(): void {
		if (this.#socket) return
		this.settled = new Promise((resolve) => setTimeout(resolve, FIRST_SEARCH_MS))
		const socket = createSocket({ type: 'udp4', reuseAddr: true })
		this.#socket = socket

		socket.on('error', (err) => {
			console.warn(`2-Stripe discovery unavailable: ${err.message}`)
			this.stop()
		})
		socket.on('message', (msg) => {
			const reply = parseDiscoveryReply(msg)
			if (!reply) return
			const changed = this.#byMac.get(reply.mac)?.ip !== reply.ip
			this.#lastSeen.set(reply.mac, Date.now())
			this.#byMac.set(reply.mac, reply)
			if (changed) this.emit('found', reply)
		})
		socket.bind(DISCOVERY_PORT, () => {
			socket.setBroadcast(true)
			this.#probe()
			this.#timer = setInterval(() => this.#probe(), PROBE_INTERVAL_MS)
		})
	}

	stop(): void {
		if (this.#timer) clearInterval(this.#timer)
		this.#timer = null
		this.#socket?.close()
		this.#socket = null
	}

	#probe(): void {
		// Windows only sends 255.255.255.255 out of one interface, so also target each interface's own broadcast address
		for (const address of broadcastAddresses()) {
			this.#socket?.send(DISCOVERY_PROBE, DISCOVERY_PORT, address)
		}

		const now = Date.now()
		for (const [mac, seen] of this.#lastSeen) {
			if (now - seen > FORGET_AFTER_MS) {
				this.#lastSeen.delete(mac)
				this.#byMac.delete(mac)
				this.emit('lost', mac)
			}
		}
	}
}

/** The limited broadcast address plus the directed broadcast address of every IPv4 interface */
export function broadcastAddresses(interfaces = networkInterfaces()): string[] {
	const addresses = new Set(['255.255.255.255'])
	for (const list of Object.values(interfaces)) {
		for (const iface of list ?? []) {
			if (iface.family !== 'IPv4' || iface.internal) continue
			const ip = iface.address.split('.').map(Number)
			const mask = iface.netmask.split('.').map(Number)
			addresses.add(ip.map((octet, i) => (octet | (~mask[i] & 0xff)) & 0xff).join('.'))
		}
	}
	return [...addresses]
}
