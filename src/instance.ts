import type { CardGenerator, SurfaceContext, SurfaceDrawProps, SurfaceInstance } from '@companion-surface/base'
import { parseColor, scaleColor, type Rgb } from './panel/color.ts'
import type { PanelConnection } from './panel/connection.ts'

export class TwoStripeSurface implements SurfaceInstance {
	readonly surfaceId: string
	readonly productName = 'TriCaster 2-Stripe'

	readonly #panel: PanelConnection
	readonly #colors = new Map<string, Rgb>()
	#brightness = 100

	constructor(surfaceId: string, panel: PanelConnection, context: SurfaceContext) {
		this.surfaceId = surfaceId
		this.#panel = panel

		panel.on('buttonDown', (id) => context.keyDownById(id))
		panel.on('buttonUp', (id) => context.keyUpById(id))
		panel.on('analog', (id, value) => context.sendVariableValue(id, value))
		panel.on('disconnected', (err) => context.disconnect(err))
	}

	async init(): Promise<void> {}

	async close(): Promise<void> {
		this.#panel.clearAll()
		await this.#panel.close()
	}

	async ready(): Promise<void> {}

	async setBrightness(percent: number): Promise<void> {
		this.#brightness = percent
		for (const [id, color] of this.#colors) {
			this.#panel.setButtonColor(id, scaleColor(color, percent))
		}
	}

	async blank(): Promise<void> {
		this.#colors.clear()
		this.#panel.clearAll()
	}

	async draw(_signal: AbortSignal, drawProps: SurfaceDrawProps): Promise<void> {
		const color = parseColor(drawProps.color)
		this.#colors.set(drawProps.controlId, color)
		this.#panel.setButtonColor(drawProps.controlId, scaleColor(color, this.#brightness))
	}

	async showStatus(_signal: AbortSignal, _cardGenerator: CardGenerator, _statusMessage: string): Promise<void> {
		// The panel has no display to show status text on
		await this.blank()
	}
}
