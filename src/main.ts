import { EventEmitter } from 'node:events'
import type {
	DetectionSurfaceInfo,
	OpenSurfaceResult,
	RemoteSurfaceConnectionInfo,
	SomeCompanionInputField,
	SurfaceContext,
	SurfacePlugin,
	SurfacePluginDetection,
	SurfacePluginDetectionEvents,
	SurfacePluginRemote,
	SurfacePluginRemoteEvents,
} from '@companion-surface/base'
import { ANALOG_INPUTS, buildSurfaceLayout } from './panel/controls.ts'
import { TwoStripeConnection } from './panel/connection.ts'
import { PanelDiscovery } from './panel/discovery.ts'
import { TwoStripeSurface } from './instance.ts'
import { SWITCHER_CONFIG_FIELDS } from './switchers.ts'

const RETRY_INTERVAL_MS = 5000

interface PanelLink {
	/** Address from the user's config, empty to use the first panel found */
	host: string
	/** Learned from discovery once connected */
	mac: string | null
	stopped: boolean
	retryTimer: NodeJS.Timeout | null
}

interface PluginInfo {
	connectionId: string
}

class TwoStripeRemote extends EventEmitter<SurfacePluginRemoteEvents<PluginInfo>> implements SurfacePluginRemote<PluginInfo> {
	readonly configFields: SomeCompanionInputField[] = [
		{
			id: 'host',
			type: 'textinput',
			label: 'Panel IP address',
			tooltip: 'Leave empty to use the first 2-Stripe panel found on the network',
			default: '',
			regex: '/^$|^\\d{1,3}(\\.\\d{1,3}){3}$/',
		},
	]
	readonly checkConfigMatchesExpression = '$(objA:host) == $(objB:host)'

	/** Panels that are connected but not yet handed to Companion, or currently open */
	readonly panels = new Map<string, TwoStripeConnection>()
	readonly discovery = new PanelDiscovery()

	constructor() {
		super()
		this.discovery.on('found', (panel) => {
			console.log(`2-Stripe found: ${panel.ip} (${panel.mac}, ${panel.model})`)
			this.emit('connectionsFound', [
				{
					id: panel.mac,
					displayName: `2-Stripe (${panel.ip})`,
					description: `TriCaster 2-Stripe panel, network adapter ${panel.model}`,
					addresses: panel.ip,
					config: { host: panel.ip },
				},
			])
		})
		this.discovery.on('lost', (mac) => this.emit('connectionsForgotten', [mac]))
	}

	async startConnections(connectionInfos: RemoteSurfaceConnectionInfo[]): Promise<void> {
		for (const info of connectionInfos) {
			const host = String(info.config.host ?? '').trim()
			const existing = this.#links.get(info.connectionId)
			if (existing && existing.host === host) continue
			// The address was edited: drop the old connection before starting again
			if (existing) await this.stopConnections([info.connectionId])

			const link: PanelLink = { host, mac: null, stopped: false, retryTimer: null }
			this.#links.set(info.connectionId, link)
			void this.#connect(info.connectionId)
		}
	}

	async stopConnections(connectionIds: string[]): Promise<void> {
		for (const id of connectionIds) {
			const link = this.#links.get(id)
			if (link) {
				link.stopped = true
				if (link.retryTimer) clearTimeout(link.retryTimer)
			}
			this.#links.delete(id)
			await this.panels.get(id)?.close()
			this.panels.delete(id)
		}
	}

	rejectSurface(surfaceInfo: DetectionSurfaceInfo<PluginInfo>): void {
		void this.stopConnections([surfaceInfo.pluginInfo.connectionId])
	}

	connectionIds(): string[] {
		return [...this.#links.keys()]
	}

	/** Whether a manually added remote connection is responsible for this panel, so auto-detection should leave it alone */
	claims(mac: string, ip: string): boolean {
		for (const link of this.#links.values()) {
			if (link.mac === mac || link.host === ip || link.host === '') return true
		}
		return false
	}

	readonly #links = new Map<string, PanelLink>()

	/**
	 * Pick the address to try next. Link-local addresses can change when the panel restarts,
	 * so once we know a panel's MAC we follow it to wherever discovery last saw it.
	 */
	#resolveHost(link: PanelLink): string | undefined {
		if (link.mac) {
			const current = this.discovery.ipForMac(link.mac)
			if (current) return current
		}
		if (link.host) return link.host
		return this.discovery.panels[0]?.ip
	}

	/** Connect to a panel, and keep retrying until the connection is stopped */
	async #connect(connectionId: string): Promise<void> {
		const link = this.#links.get(connectionId)
		if (!link || link.stopped) return

		const retry = () => {
			this.panels.delete(connectionId)
			if (!link.stopped) link.retryTimer = setTimeout(() => void this.#connect(connectionId), RETRY_INTERVAL_MS)
		}

		// Let discovery answer first, so the surface id is based on the MAC from the very first connect
		await this.discovery.settled
		if (link.stopped) return

		const host = this.#resolveHost(link)
		if (!host) {
			retry()
			return
		}

		const panel = new TwoStripeConnection(host)
		try {
			await panel.connect()
		} catch (e) {
			console.warn(`2-Stripe ${host}: ${e instanceof Error ? e.message : e}`)
			retry()
			return
		}
		if (link.stopped) {
			await panel.close()
			return
		}

		this.panels.set(connectionId, panel)
		panel.once('disconnected', (err) => {
			console.warn(`2-Stripe ${host}: ${err.message}`)
			retry()
		})

		link.mac ??= this.discovery.macForIp(host) ?? null
		this.emit('surfacesConnected', [
			{
				// Prefer the MAC so Companion keeps the same surface if the address changes
				surfaceId: `2stripe-${link.mac ?? host}`,
				deviceHandle: connectionId,
				description: 'TriCaster 2-Stripe',
				pluginInfo: { connectionId },
			},
		])
	}
}

/**
 * Finds panels on the network by itself and hands them to Companion, the way the ATEM module finds switchers.
 * No address needs to be entered, and when a panel comes back (after a reboot, or on a new link-local address)
 * it is connected again and Companion gives it the same surface, because the surface id is based on its MAC.
 */
class TwoStripeDetection extends EventEmitter<SurfacePluginDetectionEvents<PluginInfo>> implements SurfacePluginDetection<PluginInfo> {
	/** MACs with a connection being made or open */
	readonly #active = new Set<string>()
	/** MACs Companion chose not to open, left alone until they drop off the network */
	readonly #rejected = new Set<string>()
	#started = false

	readonly remote: TwoStripeRemote

	constructor(remote: TwoStripeRemote) {
		super()
		this.remote = remote
		remote.discovery.on('seen', (panel) => void this.#tryOpen(panel.mac, panel.ip))
		remote.discovery.on('lost', (mac) => this.#rejected.delete(mac))
	}

	start(): void {
		this.#started = true
	}

	async triggerScan(): Promise<void> {
		this.#rejected.clear()
		this.remote.discovery.probeNow()
	}

	rejectSurface(surfaceInfo: DetectionSurfaceInfo<PluginInfo>): void {
		const mac = surfaceInfo.deviceHandle
		this.#rejected.add(mac)
		void this.#close(mac)
	}

	async stop(): Promise<void> {
		this.#started = false
		await Promise.all([...this.#active].map((mac) => this.#close(mac)))
	}

	async #tryOpen(mac: string, ip: string): Promise<void> {
		if (!this.#started || this.#active.has(mac) || this.#rejected.has(mac)) return
		if (this.remote.claims(mac, ip)) return
		this.#active.add(mac)

		const panel = new TwoStripeConnection(ip)
		try {
			await panel.connect()
		} catch (e) {
			console.warn(`2-Stripe ${ip}: ${e instanceof Error ? e.message : e}`)
			this.#active.delete(mac)
			return
		}
		if (!this.#started || !this.#active.has(mac)) {
			await panel.close()
			return
		}

		const connectionId = detectedConnectionId(mac)
		this.remote.panels.set(connectionId, panel)
		panel.once('disconnected', (err) => {
			console.warn(`2-Stripe ${ip}: ${err.message}`)
			this.remote.panels.delete(connectionId)
			this.#active.delete(mac)
			// Let Companion release the surface; the next search reply connects it again
			this.emit('surfacesRemoved', [mac])
		})

		console.log(`2-Stripe connected automatically: ${ip} (${mac})`)
		this.emit('surfacesAdded', [
			{
				surfaceId: `2stripe-${mac}`,
				deviceHandle: mac,
				description: 'TriCaster 2-Stripe',
				pluginInfo: { connectionId },
			},
		])
	}

	async #close(mac: string): Promise<void> {
		this.#active.delete(mac)
		const connectionId = detectedConnectionId(mac)
		const panel = this.remote.panels.get(connectionId)
		this.remote.panels.delete(connectionId)
		await panel?.close()
	}
}

function detectedConnectionId(mac: string): string {
	return `detected:${mac}`
}

const remote = new TwoStripeRemote()
const detection = new TwoStripeDetection(remote)

const plugin: SurfacePlugin<PluginInfo> = {
	detection,
	remote,

	async init(): Promise<void> {
		detection.start()
		remote.discovery.start()
	},

	async destroy(): Promise<void> {
		remote.discovery.stop()
		await detection.stop()
		await remote.stopConnections(remote.connectionIds())
	},

	async openSurface(surfaceId: string, pluginInfo: PluginInfo, context: SurfaceContext): Promise<OpenSurfaceResult> {
		const panel = remote.panels.get(pluginInfo.connectionId)
		if (!panel) throw new Error(`No 2-Stripe connection for ${pluginInfo.connectionId}`)

		return {
			surface: new TwoStripeSurface(surfaceId, panel, context),
			registerProps: {
				brightness: false,
				surfaceLayout: buildSurfaceLayout(),
				transferVariables: ANALOG_INPUTS.map((v) => ({ id: v.id, type: 'input' as const, name: v.name })),
				pincodeMap: null,
				location: panel.host,
				configFields: SWITCHER_CONFIG_FIELDS,
			},
		}
	},
}

export default plugin
