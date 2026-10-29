// Builds 2stripe-tbar-triggers.companionconfig: two Companion 5.1 triggers that drive the switchers from the T-bars.
//   custom:tbar_atem (0-100, from the surface's "T-Bar n position (0 to 100)") -> ATEM M/E 1 T-bar
//   custom:tbar_vmix (0-255, from the surface's "T-Bar n position (0 to 255)") -> vMix T-bar (mix 1)
// Run: node templates/generate-triggers.mjs [connections.json] > out.companionconfig
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const VMIX = 'kMWL9qyZ7OlQDDwPIeGzb'
const ATEM = 'a_j7YLfLHvsk_VOA-AifG'

const id = () => randomBytes(16).toString('base64url').slice(0, 21)
const opts = (o) => Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isExpression: false }]))

function trigger(name, sortOrder, variable, connectionId, definitionId, options, upgradeIndex) {
	return {
		type: 'trigger',
		options: { name, enabled: true, sortOrder, notes: '' },
		actions: [{ id: id(), definitionId, connectionId, options: opts(options), upgradeIndex, type: 'action' }],
		condition: [],
		events: [{ id: id(), type: 'variable_changed', enabled: true, options: { variableId: `custom:${variable}` } }],
		localVariables: [],
	}
}

const triggers = {
	[id()]: trigger('2-Stripe T-bar -> ATEM M/E 1', 0, 'tbar_atem', ATEM, 'tBar', {
		mixeffect: 0,
		position: '$(custom:tbar_atem)',
		fadeDuration: 0,
		fadeAlgorithm: 'linear',
	}, 6),
	[id()]: trigger('2-Stripe T-bar -> vMix mix 1', 1, 'tbar_vmix', VMIX, 'tbar', { value: '$(custom:tbar_vmix)' }, 14),
}

const instances = process.argv[2]
	? JSON.parse(readFileSync(process.argv[2], 'utf8'))
	: {
			[VMIX]: { moduleInstanceType: 'connection', moduleId: 'studiocoast-vmix', moduleVersionId: '4.2.0', label: 'vmix', config: {}, secrets: {}, enabled: true, lastUpgradeIndex: 14, sortOrder: 0, updatePolicy: 'stable', isFirstInit: false },
			[ATEM]: { moduleInstanceType: 'connection', moduleId: 'bmd-atem', moduleVersionId: '3.21.1', label: 'atem', config: {}, secrets: {}, enabled: true, lastUpgradeIndex: 6, sortOrder: 1, updatePolicy: 'stable', isFirstInit: false },
		}

process.stdout.write(
	gzipSync(
		JSON.stringify({
			type: 'trigger_list',
			version: 12,
			companionBuild: '5.1.1',
			triggers,
			triggerCollections: [],
			instances,
			connectionCollections: [],
			imageLibrary: [],
			imageLibraryCollections: [],
		}),
	),
)
