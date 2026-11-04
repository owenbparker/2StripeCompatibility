import { Socket } from 'node:net'
import { Atem, AtemConnectionStatus, Enums } from 'atem-connection'
import './atem-in-process.ts'

const TransitionStyle = Enums.TransitionStyle
type TransitionStyle = Enums.TransitionStyle
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
	{
		id: 'atemTbarStyle',
		type: 'dropdown',
		label: 'ATEM T-bar transition',
		tooltip: 'With "Always a mix", the T-bar fades even when a stinger, wipe or other style is selected, and puts that style back afterwards for the AUTO button.',
		choices: [
			{ id: 'mix', label: 'Always a mix (fade)' },
			{ id: 'selected', label: 'The style selected on the ATEM' },
		],
		default: 'mix',
	},
]

export interface SwitcherConfig {
	vmixHost: string
	atemHost: string
	vmixTbar: 'tbar1' | 'tbar2'
	atemAlwaysMix: boolean
}

export function parseSwitcherConfig(config: Record<string, unknown>): SwitcherConfig {
	return {
		vmixHost: String(config.vmixHost ?? '127.0.0.1').trim(),
		// People paste the address with the ATEM's port (172.24.192.213:9910); the port is always 9910
		atemHost: String(config.atemHost ?? '').trim().replace(/:\d*$/, ''),
		vmixTbar: config.vmixTbar === 'tbar2' ? 'tbar2' : 'tbar1',
		atemAlwaysMix: config.atemTbarStyle !== 'selected',
	}
}

/** From rest, the lever has to move this far before a transition starts, so a wobble at the end can't start one */
const START = 0.08

/**
 * Turns the physical lever position into the switcher's transition position.
 * Like a real switcher, the lever doesn't spring back: after a transition completes at one end, the next one runs
 * by moving it back the other way, so the direction flips each time a transition reaches 100%.
 */
export class TbarFollower {
	/** null until the first reading, when wherever the lever sits becomes 0% */
	#flipped: boolean | null
	#pos = 0
	#took = false

	/** @param leverAtTop where the lever sits when this starts, so that end counts as 0%. Left out, the first reading decides. */
	constructor(leverAtTop?: boolean) {
		this.#flipped = leverAtTop ?? null
	}

	/** Whether a transition is part way through */
	get running(): boolean {
		return this.#pos > 0 && this.#pos < 1
	}

	/** The last position returned, 0 to 1 */
	get lastPosition(): number {
		return this.#pos
	}

	/** True once, after the transition has completed */
	takeCompleted(): boolean {
		const took = this.#took
		this.#took = false
		return took
	}

	/**
	 * @param lever 0 to 1.
	 * @returns the transition position, 0 to 1, or null when nothing should be sent: from rest, the lever has to move
	 * START into its travel before a transition begins, so a lever wobbling at either end can't nudge the switcher.
	 */
	position(lever: number): number | null {
		this.#flipped ??= lever > 0.5
		const pos = Math.min(1, Math.max(0, this.#flipped ? 1 - lever : lever))
		if (!this.running && pos < START) return null
		if (pos >= 1) {
			this.#flipped = !this.#flipped
			this.#took = true
		}
		this.#pos = pos
		return pos
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
		const pos = this.#follower.position(lever)
		if (pos !== null) this.#out.push(Math.round(pos * 255))
	}

	get follower(): TbarFollower {
		return this.#follower
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

/** How long the T-bar must sit still after a transition before the selected style is put back */
const RESTORE_DELAY_MS = 1500

export class AtemTbar {
	#me = 1
	#follower = new TbarFollower()
	#lever = 0
	#lastMoveAt = 0
	#lastWarning = 0
	/** Make every T-bar transition a mix, whatever style is selected on the switcher */
	alwaysMix = true
	/** The style that was selected before the T-bar switched it to a mix, put back once the T-bar has been left alone */
	#saved: { me: number; style: TransitionStyle } | null = null
	#restoreTimer: NodeJS.Timeout | null = null
	readonly #atem = new Atem({ disableMultithreaded: true })
	readonly #out: LatestOnly
	readonly host: string

	constructor(host: string) {
		this.host = host
		console.warn(`2-Stripe connecting to ATEM ${host}`)
		this.#atem.on('error', (e) => console.warn(`2-Stripe ATEM ${host}: ${e}`))
		this.#atem.on('connected', () => {
			const state = this.#atem.state
			const me1 = state?.video.mixEffects[0]
			const name = (input?: number) => (input === undefined ? '?' : `${input} ${state?.inputs[input]?.longName ?? ''}`.trim())
			console.warn(
				`2-Stripe connected to ATEM ${host}: ${state?.info.productIdentifier ?? 'unknown model'}, ` +
					`M/E 1 program ${name(me1?.programInput)}, preview ${name(me1?.previewInput)}`,
			)
		})
		this.#atem.on('disconnected', () => {
			this.#saved = null
			console.warn(`2-Stripe lost the ATEM ${host}`)
		})
		this.#atem.on('info', (m) => {
			// 'reconnect' repeats every second while the ATEM doesn't answer; keep the log readable
			if (m === 'reconnect') this.#warn(`still trying to reach the ATEM ${host}`)
			else console.warn(`2-Stripe ATEM ${host}: ${m}`)
		})
		void this.#atem.connect(host).catch((e) => console.warn(`2-Stripe ATEM ${host}: ${e}`))
		this.#out = new LatestOnly(async (value) => {
			if (this.#atem.status !== AtemConnectionStatus.CONNECTED) {
				this.#warn(`T-bar moved but the ATEM ${host} is not connected`)
				return
			}
			const me = this.#me - 1
			try {
				const state = this.#atem.state?.video.mixEffects[me]
				const midway = value > 0 && value < 10000
				if (this.alwaysMix && midway && state && !state.transitionPosition.inTransition) {
					// A transition is about to start: make it a mix, and remember the selected style to put back later
					const style = state.transitionProperties.nextStyle
					if (style !== TransitionStyle.MIX) {
						if (!this.#saved || this.#saved.me !== me) this.#saved = { me, style }
						await this.#atem.setTransitionStyle({ nextStyle: TransitionStyle.MIX }, me)
					}
				}
				await this.#atem.setTransitionPosition(value, me)
			} catch (e) {
				this.#warn(`ATEM ${host} refused the T-bar on M/E ${this.#me}: ${e}`)
			}
		})
	}

	/** Follow the M/E chosen with the panel's 1-4 buttons. The lever's current end becomes 0% for the new M/E. */
	select(me: number): void {
		if (me === this.#me) return
		this.#me = me
		this.#follower = new TbarFollower(this.#lever > 0.5)
	}

	move(lever: number): void {
		const now = Date.now()
		this.#lever = lever
		// If the ATEM finished or dropped the transition by itself (AUTO, CUT, another panel) while the lever was left
		// part way, the end the lever is nearest becomes 0% again. This only goes by the ATEM once the lever has been
		// still for a moment, since its reports lag behind a lever that's moving.
		const atem = this.#atem.state?.video.mixEffects[this.#me - 1]?.transitionPosition
		if (this.#follower.running && atem && !atem.inTransition && now - this.#lastMoveAt > 500) {
			this.#follower = new TbarFollower(lever > 0.5)
		}
		// Like vMix, a transition completes at either end: after one finishes at the top, pulling the lever back down runs the next
		const pos = this.#follower.position(lever)
		if (pos === null) return
		this.#lastMoveAt = now
		this.#out.push(Math.round(pos * 10000))
		this.#scheduleRestore(this.#follower.running)
	}

	get follower(): TbarFollower {
		return this.#follower
	}

	/** Put the selected style back once the T-bar has been left alone at an end */
	#scheduleRestore(running: boolean): void {
		if (this.#restoreTimer) clearTimeout(this.#restoreTimer)
		this.#restoreTimer = null
		if (running || !this.#saved) return
		this.#restoreTimer = setTimeout(() => {
			this.#restoreTimer = null
			const saved = this.#saved
			const me = saved && this.#atem.state?.video.mixEffects[saved.me]
			if (!saved || !me || me.transitionPosition.inTransition) return
			this.#saved = null
			// Unless someone picked another style since
			if (me.transitionProperties.nextStyle === TransitionStyle.MIX && saved.style !== TransitionStyle.MIX) {
				this.#atem.setTransitionStyle({ nextStyle: saved.style }, saved.me).catch((e) => this.#warn(`ATEM ${this.host}: ${e}`))
			}
		}, RESTORE_DELAY_MS)
	}

	/** At most one warning every few seconds, so a moving lever doesn't flood the log */
	#warn(message: string): void {
		const now = Date.now()
		if (now - this.#lastWarning < 3000) return
		this.#lastWarning = now
		console.warn(`2-Stripe ${message}`)
	}

	close(): void {
		if (this.#restoreTimer) clearTimeout(this.#restoreTimer)
		void this.#atem.destroy().catch(() => {})
	}
}

/** How close to either end of its travel counts as the end */
const SNAP = 0.04

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
		if (this.#atem) this.#atem.alwaysMix = config.atemAlwaysMix
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
		this.#atem?.select(me)
	}

	tbar(id: 'tbar1' | 'tbar2', raw: number): void {
		// Snap the last few percent at each end, so a lever pushed not quite all the way still completes the transition
		const lever = raw <= SNAP ? 0 : raw >= 1 - SNAP ? 1 : raw
		this.#lever[id] = lever
		if (!this.#config) return
		const vmix = id === this.#config.vmixTbar
		const target = vmix ? this.#vmix : this.#atem
		target?.move(lever)
		this.#track(id, raw, () => {
			const name = vmix ? `vMix mix ${this.#vmixMix}` : `ATEM M/E ${this.#atemMe}`
			if (!target) return `${name} (not set up)`
			const f = target.follower
			const result = f.takeCompleted()
				? 'took the shot'
				: f.running
					? `left part way at ${Math.round(f.lastPosition * 100)}%`
					: 'no transition'
			return `${name}: ${result}`
		})
	}

	readonly #gestures = new Map<string, { first: number; low: number; high: number; last: number; count: number; timer: NodeJS.Timeout }>()

	/** One log line per T-bar movement, once the lever stops, so a misbehaving transition can be traced in the log */
	#track(id: 'tbar1' | 'tbar2', raw: number, outcome: () => string): void {
		const g = this.#gestures.get(id)
		if (g) clearTimeout(g.timer)
		const next = g ?? { first: raw, low: raw, high: raw, last: raw, count: 0, timer: undefined as unknown as NodeJS.Timeout }
		next.low = Math.min(next.low, raw)
		next.high = Math.max(next.high, raw)
		next.last = raw
		next.count++
		next.timer = setTimeout(() => {
			this.#gestures.delete(id)
			const pct = (v: number) => `${Math.round(v * 100)}%`
			console.warn(
				`2-Stripe ${id === 'tbar1' ? 'T-Bar 1' : 'T-Bar 2'} moved ${pct(next.first)} to ${pct(next.last)} ` +
					`(range ${pct(next.low)}-${pct(next.high)}, ${next.count} readings) -> ${outcome()}`,
			)
		}, 400)
		this.#gestures.set(id, next)
	}

	close(): void {
		for (const g of this.#gestures.values()) clearTimeout(g.timer)
		this.#gestures.clear()
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
		this.#atem.select(this.#atemMe)
		this.#atem.alwaysMix = this.#config?.atemAlwaysMix ?? true
	}

	#stopDiscovery(): void {
		this.#discovery?.stop()
		this.#discovery = null
	}
}
