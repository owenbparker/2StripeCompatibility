import { EventEmitter } from 'node:events'
import type {
	DetectionSurfaceInfo,
	OpenSurfaceResult,
	RemoteSurfaceConnectionInfo,
	SomeCompanionInputField,
	SurfaceContext,
	SurfacePlugin,
	SurfacePluginRemote,
	SurfacePluginRemoteEvents,
} from '@companion-surface/base'
import { ANALOG_INPUTS, buildSurfaceLayout } from './panel/controls.ts'
import { TwoStripeConnection } from './panel/connection.ts'
import { PanelDiscovery } from './panel/discovery.ts'
import { TwoStripeSurface } from './instance.ts'

const RETRY_INTERVAL_MS = 5000

interface PluginInfo {
	connectionId: string
}

class TwoStripeRemote extends EventEmitter<SurfacePluginRemoteEvents<PluginInfo>> implements SurfacePluginRemote<PluginInfo> {
	readonly configFields: SomeCompanionInputField[] = [
		{
			id: 'host',
			type: 'textinput',
			label: 'Panel IP address',
			default: '',
			regex: '/^\\d{1,3}(\\.\\d{1,3}){3}$/',
		},
	]
	readonly checkConfigMatchesExpression = '$(objA:host) == $(objB:host)'

	/** Panels that are connected but not yet handed to Companion, or currently open */
	readonly panels = new Map<string, TwoStripeConnection>()
	readonly discovery = new PanelDiscovery()

	constructor() {
		super()
		this.discovery.on('found', (panel) => {
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
			if (!host || this.#links.has(info.connectionId)) continue

			const link = { host, stopped: false, retryTimer: null as NodeJS.Timeout | null }
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

	readonly #links = new Map<string, { host: string; stopped: boolean; retryTimer: NodeJS.Timeout | null }>()

	/** Connect to a panel, and keep retrying until the connection is stopped */
	async #connect(connectionId: string): Promise<void> {
		const link = this.#links.get(connectionId)
		if (!link || link.stopped) return

		const retry = () => {
			this.panels.delete(connectionId)
			if (!link.stopped) link.retryTimer = setTimeout(() => void this.#connect(connectionId), RETRY_INTERVAL_MS)
		}

		const panel = new TwoStripeConnection(link.host)
		try {
			await panel.connect()
		} catch (e) {
			console.warn(`2-Stripe ${link.host}: ${e instanceof Error ? e.message : e}`)
			retry()
			return
		}
		if (link.stopped) {
			await panel.close()
			return
		}

		this.panels.set(connectionId, panel)
		panel.once('disconnected', (err) => {
			console.warn(`2-Stripe ${link.host}: ${err.message}`)
			retry()
		})

		this.emit('surfacesConnected', [
			{
				surfaceId: `2stripe-${link.host}`,
				deviceHandle: connectionId,
				description: 'TriCaster 2-Stripe',
				pluginInfo: { connectionId },
			},
		])
	}
}

const remote = new TwoStripeRemote()

const plugin: SurfacePlugin<PluginInfo> = {
	remote,

	async init(): Promise<void> {
		remote.discovery.start()
	},

	async destroy(): Promise<void> {
		remote.discovery.stop()
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
				configFields: null,
			},
		}
	},
}

export default plugin
