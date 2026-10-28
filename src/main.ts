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
import { TwoStripeConnection, type PanelConnection } from './panel/connection.ts'
import { TwoStripeSurface } from './instance.ts'

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
	readonly panels = new Map<string, PanelConnection>()

	async startConnections(connectionInfos: RemoteSurfaceConnectionInfo[]): Promise<void> {
		for (const info of connectionInfos) {
			const host = String(info.config.host ?? '').trim()
			if (!host) continue

			const panel = new TwoStripeConnection(host)
			this.panels.set(info.connectionId, panel)

			try {
				await panel.connect()
			} catch (e) {
				console.error(`2-Stripe ${host}: ${e instanceof Error ? e.message : e}`)
				continue
			}

			this.emit('surfacesConnected', [
				{
					surfaceId: panel.serial,
					deviceHandle: info.connectionId,
					description: 'TriCaster 2-Stripe',
					pluginInfo: { connectionId: info.connectionId },
				},
			])
		}
	}

	async stopConnections(connectionIds: string[]): Promise<void> {
		for (const id of connectionIds) {
			await this.panels.get(id)?.close()
			this.panels.delete(id)
		}
	}

	rejectSurface(surfaceInfo: DetectionSurfaceInfo<PluginInfo>): void {
		const id = surfaceInfo.pluginInfo.connectionId
		void this.panels.get(id)?.close()
		this.panels.delete(id)
	}
}

const remote = new TwoStripeRemote()

const plugin: SurfacePlugin<PluginInfo> = {
	remote,

	async init(): Promise<void> {},

	async destroy(): Promise<void> {
		await remote.stopConnections([...remote.panels.keys()])
	},

	async openSurface(surfaceId: string, pluginInfo: PluginInfo, context: SurfaceContext): Promise<OpenSurfaceResult> {
		const panel = remote.panels.get(pluginInfo.connectionId)
		if (!panel) throw new Error(`No 2-Stripe connection for ${pluginInfo.connectionId}`)

		return {
			surface: new TwoStripeSurface(surfaceId, panel, context),
			registerProps: {
				brightness: true,
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
