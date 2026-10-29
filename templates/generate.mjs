// Builds 2stripe-vmix-atem.companionconfig: a Companion 5.1 page laid out for the tricaster-2stripe surface (v0.1.7+).
//   Upper stripe -> vMix, on the mix picked with the 1 2 3 4 buttons above the upper middle cluster; light grey area -> vMix mix 1
//   Lower stripe -> ATEM, on the M/E picked with the 1 2 3 4 buttons above the lower middle cluster; dark grey area -> ATEM M/E 1
//   Each stripe: KEY row = overlay, A/C or PGM row = program, B/D or PREV row = preview. The right-hand section is left empty.
// Run: node templates/generate.mjs [connections.json] > out.companionconfig
// connections.json (optional) is the "instances" object from one of your own page exports, so the page
// points at your existing vMix and ATEM connections. Without it, connections labelled "vmix" and "atem" are assumed.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const VMIX = 'kMWL9qyZ7OlQDDwPIeGzb'
const ATEM = 'a_j7YLfLHvsk_VOA-AifG'
const ME = 0 // ATEM M/E driven by the upper stripe

const RED = 0xff0000
const GREEN = 0x00ff00
const YELLOW = 0xeeee00
const WHITE = 0xffffff

const id = () => randomBytes(16).toString('base64url').slice(0, 21)
const v = (value) => ({ value, isExpression: false })
const opts = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, v(x)]))
const geometry = { opacity: v(100), x: v(0), y: v(0), width: v(100), height: v(100), rotation: v(0) }
const imageLayer = (lid, name) => ({
	id: lid,
	name,
	usage: 'auto',
	type: 'image',
	pinnedProperties: ['base64Image', 'halign', 'valign'],
	enabled: v(true),
	...geometry,
	base64Image: v(null),
	halign: v('center'),
	valign: v('center'),
	fillMode: v('fit'),
})

function control(text, actions = [], feedbacks = []) {
	return {
		type: 'button-layered',
		style: {
			layers: [
				{ id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: v('default'), showStatusIcons: v('default') },
				{
					id: 'box0',
					name: 'Background',
					usage: 'auto',
					type: 'box',
					pinnedProperties: ['color'],
					enabled: v(true),
					...geometry,
					color: v(0),
					cornerRadius: v(0),
					borderWidth: v(0),
					borderColor: v(0),
					borderPosition: v('inside'),
				},
				imageLayer('image0', 'Image'),
				{
					id: 'text0',
					name: 'Text',
					usage: 'auto',
					type: 'text',
					pinnedProperties: ['text', 'fontsize', 'fontsizeAllowShrink', 'color', 'halign', 'valign'],
					enabled: v(true),
					...geometry,
					text: v(text),
					color: v(WHITE),
					halign: v('center'),
					valign: v('center'),
					fontsize: v(24),
					fontsizeAllowShrink: v(true),
					font: v('companion-sans'),
					weight: v('normal'),
					styles: v([]),
					outlineColor: v(4278190080),
				},
				imageLayer('imageBuffers', 'Image Buffers'),
			],
		},
		options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: true, notes: '' },
		feedbacks,
		steps: { 0: { action_sets: { down: actions, up: [] }, options: { runWhileHeld: [] } } },
		localVariables: [],
	}
}

const upgradeIndex = { [VMIX]: 14, [ATEM]: 6 }
const action = (conn, definitionId, o) => ({
	id: id(),
	definitionId,
	connectionId: conn,
	options: opts(o),
	upgradeIndex: upgradeIndex[conn],
	type: 'action',
})
const feedbackBase = (conn, definitionId, o, styleOverrides) => ({
	id: id(),
	definitionId,
	connectionId: conn,
	options: opts(o),
	upgradeIndex: upgradeIndex[conn],
	type: 'feedback',
	isInverted: v(false),
	styleOverrides,
})
const override = (elementId, elementProperty, value) => ({ overrideId: id(), elementId, elementProperty, override: v(value) })
/** Boolean feedback: lights the button in a fixed colour */
const lit = (conn, definitionId, o, bg = RED) =>
	feedbackBase(conn, definitionId, o, [override('text0', 'color', WHITE), override('box0', 'color', bg)])
/** Advanced feedback (vMix tally): the module returns the style, mapped onto the layers */
const advanced = (conn, definitionId, o) =>
	feedbackBase(conn, definitionId, o, [
		override('text0', 'color', 'color'),
		override('box0', 'color', 'bgcolor'),
	])

// The ATEM M/E and vMix mix the stripes act on live in two custom variables, set by the M/E buttons.
// They are created on the first press, so press an M/E button for each switcher once after importing.
const ATEM_ME = 'atem_me' // 1-4
const VMIX_MIX = 'vmix_mix' // 1-4
const vmixMix = { mix: -2, mixVariable: `$(custom:${VMIX_MIX})` }
const setVar = (name, value) => ({
	id: id(),
	definitionId: 'custom_variable_set_value',
	connectionId: 'internal',
	options: opts({ name, create: true, value: String(value) }),
	type: 'action',
})
const varIs = (name, value) => ({
	id: id(),
	definitionId: 'variable_value',
	connectionId: 'internal',
	options: opts({ variable: `custom:${name}`, op: 'eq', value: String(value) }),
	type: 'feedback',
	isInverted: v(false),
})
const varLit = (name, value) => ({ ...varIs(name, value), styleOverrides: [override('text0', 'color', WHITE), override('box0', 'color', YELLOW)] })
// Grid position -> control. Rows/columns follow the tricaster-2stripe v0.1.7 surface layout.
const controls = {}
const put = (row, column, c) => ((controls[row] ??= {})[column] = c)

const atemMe = `$(custom:${ATEM_ME})`
for (let n = 1; n <= 16; n++) {
	const col = n - 1
	const input = String(n)
	// Upper stripe: vMix on the selected mix. A/C text labels the LCD above it.
	put(
		0,
		col,
		control(`OVL\n${n}`, [action(VMIX, 'overlayFunctions', { type: 'OverlayInput', input, overlay: '1', mix: [-2], mixVariable: vmixMix.mixVariable })], [
			advanced(VMIX, 'overlayStatus', { input, overlay: '1', fg: WHITE, bgPreview: GREEN, bgProgram: RED }),
		]),
	)
	put(
		2,
		col,
		control(`$(vmix:input_${n}_name)`, [action(VMIX, 'programCut', { input, ...vmixMix })], [
			advanced(VMIX, 'inputLive', { input, ...vmixMix, fg: WHITE, bg: RED, tally: '' }),
		]),
	)
	put(
		3,
		col,
		control(`PVW\n${n}`, [action(VMIX, 'previewInput', { input, ...vmixMix })], [
			advanced(VMIX, 'inputPreview', { input, ...vmixMix, fg: WHITE, bg: GREEN, tally: '' }),
		]),
	)
	// Lower stripe: ATEM on the selected M/E. KEY row = DSK 1 source (fill and key), PGM = program, PREV = preview.
	put(4, col, control(`DSK1\n${n}`, [action(ATEM, 'dskSource', { key: 0, fill: n, cut: n })], [lit(ATEM, 'dsk_source', { key: 0, fill: n }, YELLOW)]))
	put(6, col, control(`$(atem:short_${n})`, [action(ATEM, 'programVariables', { mixeffect: atemMe, input })], [lit(ATEM, 'programVariables', { mixeffect: atemMe, input })]))
	put(7, col, control(`PVW\n${n}`, [action(ATEM, 'previewVariables', { mixeffect: atemMe, input })], [lit(ATEM, 'previewVariables', { mixeffect: atemMe, input }, GREEN)]))
}

// 1 2 3 4 above each middle cluster: pick the vMix mix (upper) or ATEM M/E (lower)
for (let n = 1; n <= 4; n++) {
	put(10, n, control(`MIX ${n}`, [setVar(VMIX_MIX, n)], [varLit(VMIX_MIX, n)]))
	put(14, n, control(`M/E ${n}`, [setVar(ATEM_ME, n)], [varLit(ATEM_ME, n)]))
}

// Light grey transition area (rows 8-11): vMix mix 1, the same mix as the upper T-bar
const mix1 = { mix: 0, mixVariable: '' }
const vmixTransition = (fn, label) => control(label, [action(VMIX, 'transition', { functionID: fn, ...mix1 })])
const vmixMixTransition = (fn, label, duration) => control(label, [action(VMIX, 'transitionMix', { functionID: fn, ...mix1, duration })])
put(8, 0, vmixTransition('Transition1', 'T1'))
for (let k = 1; k <= 4; k++) put(8, k, vmixTransition(`Stinger${k}`, `STING ${k}`))
put(9, 0, vmixMixTransition('Fade', 'FADE', '1000'))
put(9, 1, vmixTransition('Transition2', 'T2'))
put(10, 0, vmixTransition('Transition3', 'T3'))
put(
	9,
	2,
	control('FTB', [action(VMIX, 'toggleFunctions', { functionID: 'FadeToBlack', value: '' })], [lit(VMIX, 'status', { status: 'fadeToBlack', value: '' })]),
)
put(11, 0, vmixMixTransition('Cut', 'CUT', '0'))
put(11, 1, vmixMixTransition('Fade', 'AUTO', '1000'))
// KEY 1-4 TAKE/AUTO -> vMix overlays 1-4: TAKE toggles the last input in/out, AUTO transitions it out
for (let k = 1; k <= 4; k++) {
	const overlay = String(k)
	const tally = () => advanced(VMIX, 'overlayStatus', { input: '', overlay, fg: WHITE, bgPreview: GREEN, bgProgram: RED })
	const ovl = (type) => action(VMIX, 'overlayFunctions', { type, input: '', overlay, mix: [0], mixVariable: '' })
	put(7 + k, 6, control(`OVL${k}\nTAKE`, [ovl('Last')], [tally()]))
	put(7 + k, 7, control(`OVL${k}\nOUT`, [ovl('Out')], [tally()]))
}

// Dark grey transition area (rows 12-15): ATEM M/E 1, the same M/E as the lower T-bar
const ME1 = { mixeffect: 0 }
const selection = (component, label, selId) =>
	control(label, [action(ATEM, 'transitionSelectionComponent', { ...ME1, component, mode: 'toggle' })], [
		lit(ATEM, 'transitionSelection', { ...ME1, matchmethod: 'contains', selection: [selId] }, YELLOW),
	])
put(12, 0, selection(0, 'BKGD', 'background'))
for (let k = 1; k <= 4; k++) put(12, k, selection(k, `KEY ${k}`, `key${k - 1}`))
const style = (st, label) => control(label, [action(ATEM, 'transitionStyle', { ...ME1, style: st })], [lit(ATEM, 'transitionStyle', { ...ME1, style: st }, YELLOW)])
put(13, 0, style(0, 'MIX'))
put(13, 1, style(2, 'WIPE'))
put(14, 0, style(3, 'DVE'))
put(13, 2, control('FTB', [action(ATEM, 'fadeToBlackAuto', ME1)], [lit(ATEM, 'fadeToBlackIsBlack', { ...ME1, state: 'on' })]))
put(15, 0, control('CUT', [action(ATEM, 'cut', ME1)]))
put(15, 1, control('AUTO', [action(ATEM, 'auto', ME1)], [lit(ATEM, 'inTransition', ME1)]))
// KEY 1-4 TAKE/AUTO -> ATEM downstream keyers 1-4
for (let k = 0; k < 4; k++) {
	const onAir = () => lit(ATEM, 'dsk_bg', { key: k })
	put(12 + k, 6, control(`DSK${k + 1}\nCUT`, [action(ATEM, 'dsk', { onair: 'toggle', key: k })], [onAir()]))
	put(12 + k, 7, control(`DSK${k + 1}\nAUTO`, [action(ATEM, 'dskAuto', { downstreamKeyerId: k })], [onAir()]))
}

const instances = process.argv[2]
	? JSON.parse(readFileSync(process.argv[2], 'utf8'))
	: {
			[VMIX]: { moduleInstanceType: 'connection', moduleId: 'studiocoast-vmix', moduleVersionId: '4.2.0', label: 'vmix', config: {}, secrets: {}, enabled: true, lastUpgradeIndex: 14, sortOrder: 0, updatePolicy: 'stable', isFirstInit: false },
			[ATEM]: { moduleInstanceType: 'connection', moduleId: 'bmd-atem', moduleVersionId: '3.21.1', label: 'atem', config: {}, secrets: {}, enabled: true, lastUpgradeIndex: 6, sortOrder: 1, updatePolicy: 'stable', isFirstInit: false },
		}

const page = {
	version: 12,
	type: 'page',
	companionBuild: '5.1.1',
	page: {
		id: id(),
		name: '2-Stripe vMix + ATEM',
		controls,
		gridSize: { minColumn: 0, maxColumn: 15, minRow: 0, maxRow: 18 },
		pageVariables: [],
	},
	instances,
	connectionCollections: [],
	oldPageNumber: 1,
	imageLibrary: [],
	imageLibraryCollections: [],
}

process.stdout.write(gzipSync(JSON.stringify(page)))
