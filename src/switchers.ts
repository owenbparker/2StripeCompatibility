import { Socket } from 'node:net'
import { Atem, AtemConnectionStatus } from 'atem-connection'
import type { SomeCompanionInputField } from '@companion-surface/base'
import { AtemDiscovery } from './atem-discovery.ts'

/**
 * The panel's T-bars drive vMix and an ATEM directly from this module, so they work without any custom variables,
 * triggers or surface settings beyond the switcher addresses.
 */
export const SWITCHER_CONFIG_FIELDS: SomeCompanionInputField[] = [
	{
		id: 'vmixHost',
		type: 'textinput',
		label: 'vMix computer address',
		tooltip: 'Where vMix runs (its TCP API on port 8099, which is always on). Empty turns the vMix T-bar off.',
		default: '127.0.0.1',
	},
	{
		id: 'atemHost',
		type: 'textinput',
		label: 'ATEM address (leave empty to find it automatically)',
		tooltip: 'Leave empty and the module searches the network for the ATEM, like the ATEM connection does. Type an IP address only to pick a specific switcher.',
		default: '',
	},
	{
		id: 'vmixTbar',
		type: 'dropdown',
		label: 'T-bar for vMix (the other one fades the ATEM)',
		choices: [
			{ id: 'tbar1', label: 'T-Bar 1' },
			{ id: 'tbar2', label: 'T-Bar 2' },
		],
		default: 'tbar1',
	},
]

export interface SwitcherConfig {
	vmixHost: string
	atemHost: string
	vmixTbar: 'tbar1' | 'tbar2'
}

export function parseSwitcherConfig(config: Record<string, unknown>): SwitcherConfig {
	return {
		vmixHost: String(config.vmixHost ?? '127.0.0.1').trim(),
		atemHost: String(config.atemHost ?? '').trim(),
		vmixTbar: config.vmixTbar === 'tbar2' ? 'tbar2' : 'tbar1',
	}
}

/**
 * Turns the physical lever position into the switcher's transition position.
 * Like a real switcher, the lever doesn't spring back: after a transition completes at one end, the next one runs
 * by moving it back the other way, so the direction flips each time a transition reaches 100%.
 */
export class TbarFollower {
	#flipped: boolean

	/** @param leverAtTop where the lever sits when this starts, so that end counts as 0% */
	constructor(leverAtTop = false) {
		this.#flipped = leverAtTop
	}

	/** @param lever 0 to 1. Returns the transition position, 0 to 1. */
	position(lever: number): number {
		const pos = this.#flipped ? 1 - lever : lever
		if (pos >= 1) this.#flipped = !this.#flipped
		return Math.min(1, Math.max(0, pos))
	}
}

/** Sends only the latest value, one at a time, so a fast-moving lever can't queue up stale positions */
class LatestOnly {
	#busy = false
	#pending: number | null = null
	readonly #send: (value: number) => Promise<void>

	constructor(send: (value: number) => Promise<void>) {
		this.#send = send
	}

	push(value: number): void {
		this.#pending = value
		if (!this.#busy) void this.#drain()
	}

	async #drain(): Promise<void> {
		this.#busy = true
		while (this.#pending !== null) {
			const value = this.#pending
			this.#pending = null
			try {
				await this.#send(value)
			} catch {
				// The switcher is unreachable or busy; the next movement tries again
			}
		}
		this.#busy = false
	}
}

const VMIX_TCP_PORT = 8099

export class VmixTbar {
	#follower = new TbarFollower()
	#mix = 1
	readonly #out: LatestOnly
	readonly #host: string
	#socket: Socket | null = null
	#closed = false

	constructor(host: string) {
		this.#host = host
		this.#out = new LatestOnly(async (value) => {
			const socket = await this.#connected()
			// vMix numbers its mixes from 0 in the API (Mix 2 is Mix=1), and Mix 1 needs no parameter
			const mix = this.#mix > 1 ? `&Mix=${this.#mix - 1}` : ''
			const command = `FUNCTION SetFader Value=${value}${mix}\r\n`
			await new Promise<void>((resolve, reject) => socket.write(command, (e) => (e ? reject(e) : resolve())))
		})
	}

	/** Follow the mix chosen with the panel's 1-4 buttons. The lever's current end becomes 0% for the new mix. */
	select(mix: number, lever: number): void {
		if (mix === this.#mix) return
		this.#mix = mix
		this.#follower = new TbarFollower(lever > 0.5)
	}

	move(lever: number): void {
		this.#out.push(Math.round(this.#follower.position(lever) * 255))
	}

	close(): void {
		this.#closed = true
		this.#socket?.destroy()
		this.#socket = null
	}

	/** vMix's TCP API: one connection, opened on first use and again after it drops */
	async #connected(): Promise<Socket> {
		if (this.#socket && !this.#socket.destroyed) return this.#socket
		if (this.#closed) throw new Error('closed')
		const socket = new Socket()
		this.#socket = socket
		socket.setNoDelay(true)
		socket.on('data', () => {}) // vMix replies to each command; nothing to do with it
		socket.on('error', (e) => console.warn(`2-Stripe vMix ${this.#host}: ${e.message}`))
		socket.on('close', () => {
			if (this.#socket === socket) this.#socket = null
		})
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('timed out')), 2000)
			socket.once('error', (e) => (clearTimeout(timer), reject(e)))
			socket.connect(VMIX_TCP_PORT, this.#host, () => (clearTimeout(timer), resolve()))
		})
		return socket
	}
}

export class AtemTbar {
	#follower = new TbarFollower()
	#me = 1
	#lastWarning = 0
	readonly #atem = new Atem({ disableMultithreaded: true })
	readonly #out: LatestOnly
	readonly host: string

	constructor(host: string) {
		this.host = host
		console.log(`2-Stripe connecting to ATEM ${host}`)
		this.#atem.on('error', (e) => console.warn(`2-Stripe ATEM ${host}: ${e}`))
		this.#atem.on('connected', () => console.log(`2-Stripe connected to ATEM ${host}`))
		this.#atem.on('disconnected', () => console.warn(`2-Stripe lost the ATEM ${host}`))
		void this.#atem.connect(host).catch((e) => console.warn(`2-Stripe ATEM ${host}: ${e}`))
		this.#out = new LatestOnly(async (value) => {
			if (this.#atem.status !== AtemConnectionStatus.CONNECTED) {
				this.#warn(`T-bar moved but the ATEM ${host} is not connected`)
				return
			}
			const me = this.#me - 1
			try {
				await this.#atem.setTransitionPosition(value, me)
			} catch (e) {
				this.#warn(`ATEM ${host} refused the T-bar on M/E ${this.#me}: ${e}`)
			}
		})
	}

	/** Follow the M/E chosen with the panel's 1-4 buttons. The lever's current end becomes 0% for the new M/E. */
	select(me: number, lever: number): void {
		if (me === this.#me) return
		this.#me = me
		this.#follower = new TbarFollower(lever > 0.5)
	}

	/** At most one warning every few seconds, so a moving lever doesn't flood the log */
	#warn(message: string): void {
		const now = Date.now()
		if (now - this.#lastWarning < 3000) return
		this.#lastWarning = now
		console.warn(`2-Stripe ${message}`)
	}

	move(lever: number): void {
		this.#out.push(Math.round(this.#follower.position(lever) * 10000))
	}

	close(): void {
		void this.#atem.destroy().catch(() => {})
	}
}

/** The two switcher T-bars for one panel, rebuilt whenever the surface's settings change */
export class SwitcherLinks {
	#config: SwitcherConfig | null = null
	#vmix: VmixTbar | null = null
	#atem: AtemTbar | null = null
	#discovery: AtemDiscovery | null = null
	#vmixMix = 1
	#atemMe = 1
	readonly #lever = { tbar1: 0, tbar2: 0 }

	update(config: SwitcherConfig): void {
		if (config.vmixHost !== this.#config?.vmixHost) {
			this.#vmix?.close()
			this.#vmix = config.vmixHost ? new VmixTbar(config.vmixHost) : null
			this.#vmix?.select(this.#vmixMix, this.#vmixLever(config))
		}
		this.#config = config
		if (config.atemHost) {
			this.#stopDiscovery()
			this.#connectAtem(config.atemHost)
		} else if (!this.#discovery) {
			// No address typed: search the network, and use the first ATEM that answers
			this.#atem?.close()
			this.#atem = null
			const discovery = new AtemDiscovery()
			this.#discovery = discovery
			discovery.on('found', (address) => {
				if (!this.#atem) this.#connectAtem(address)
			})
			discovery.start()
		}
	}

	/** Called when a 1-4 select button above the upper (vMix) or lower (ATEM) transition area is pressed */
	selectVmixMix(mix: number): void {
		this.#vmixMix = mix
		if (this.#config) this.#vmix?.select(mix, this.#vmixLever(this.#config))
	}

	selectAtemMe(me: number): void {
		this.#atemMe = me
		if (this.#config) this.#atem?.select(me, this.#lever[this.#config.vmixTbar === 'tbar1' ? 'tbar2' : 'tbar1'])
	}

	tbar(id: 'tbar1' | 'tbar2', lever: number): void {
		this.#lever[id] = lever
		if (!this.#config) return
		if (id === this.#config.vmixTbar) this.#vmix?.move(lever)
		else this.#atem?.move(lever)
	}

	close(): void {
		this.#stopDiscovery()
		this.#vmix?.close()
		this.#atem?.close()
		this.#vmix = this.#atem = null
	}

	#vmixLever(config: SwitcherConfig): number {
		return this.#lever[config.vmixTbar]
	}

	#connectAtem(host: string): void {
		if (this.#atem?.host === host) return
		this.#atem?.close()
		this.#atem = new AtemTbar(host)
		if (this.#config) this.#atem.select(this.#atemMe, this.#lever[this.#config.vmixTbar === 'tbar1' ? 'tbar2' : 'tbar1'])
	}

	#stopDiscovery(): void {
		this.#discovery?.stop()
		this.#discovery = null
	}
}
