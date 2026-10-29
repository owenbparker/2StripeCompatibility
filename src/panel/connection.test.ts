import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { once } from 'node:events'
import { TwoStripeConnection } from './connection.ts'

/** A stand-in panel that records what it receives and can send lines back */
async function fakePanel() {
	const received: string[] = []
	let client: Socket | null = null
	let buffer = ''
	const server = createServer((socket) => {
		client = socket
		socket.setEncoding('latin1')
		socket.on('data', (chunk: string) => {
			buffer += chunk
			const parts = buffer.split('\r')
			buffer = parts.pop() ?? ''
			received.push(...parts)
		})
		// Like the real panel, announce ourselves straight away
		socket.write('CH01\r\n?000000000000\r\n|011\r\n\r')
	})
	server.listen(0, '127.0.0.1')
	await once(server, 'listening')
	return {
		port: (server.address() as AddressInfo).port,
		received,
		send: (line: string) => client?.write(`${line}\r`),
		dropClient: () => client?.destroy(),
		close: () =>
			new Promise<void>((resolve) => {
				client?.destroy()
				server.close(() => resolve())
			}),
	}
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 50))

test('claims the panel and resets its lights and displays', async () => {
	const panel = await fakePanel()
	const conn = new TwoStripeConnection('127.0.0.1', panel.port, 'abcdef012345')
	await conn.connect()
	await tick()

	assert.deepEqual(panel.received.slice(0, 4), ['V', 'Qabcdef012345', 'K', 'T'])
	assert.ok(panel.received.includes('15FF'))
	assert.ok(panel.received.some((l) => l.startsWith('L10050')))

	await conn.close()
	await tick()
	assert.deepEqual(panel.received.slice(-2), ['R', 'k'])
	await panel.close()
})

test('reports button presses and releases', async () => {
	const panel = await fakePanel()
	const conn = new TwoStripeConnection('127.0.0.1', panel.port)
	await conn.connect()

	const events: string[] = []
	conn.on('buttonDown', (bank, bit) => events.push(`down ${bank.toString(16)}:${bit}`))
	conn.on('buttonUp', (bank, bit) => events.push(`up ${bank.toString(16)}:${bit}`))
	conn.on('analog', (id, value) => events.push(`${id}=${value}`))

	panel.send('15FE')
	panel.send('15FC')
	panel.send('15FF')
	panel.send('80FF')
	await tick()

	assert.deepEqual(events, ['down 15:0', 'down 15:1', 'up 15:0', 'up 15:1', 'tbar2=1'])
	await conn.close()
	await panel.close()
})

test('sends LED and LCD updates', async () => {
	const panel = await fakePanel()
	const conn = new TwoStripeConnection('127.0.0.1', panel.port)
	await conn.connect()
	conn.setLeds(0x23, 0b1000_0001)
	conn.setLcdLine(3, 'CAM1')
	await tick()

	assert.ok(panel.received.includes('237E'))
	assert.ok(panel.received.includes(`L30050${'CAM1'.padEnd(80)}`))
	await conn.close()
	await panel.close()
})

test('emits disconnected when the panel drops the connection', async () => {
	const panel = await fakePanel()
	const conn = new TwoStripeConnection('127.0.0.1', panel.port)
	await conn.connect()
	const disconnected = once(conn, 'disconnected')
	panel.dropClient()
	const [err] = await disconnected
	assert.match((err as Error).message, /closed|ECONNRESET/)
	await panel.close()
})

test('fails to connect when nothing is listening', async () => {
	const panel = await fakePanel()
	const port = panel.port
	await panel.close()
	await assert.rejects(new TwoStripeConnection('127.0.0.1', port).connect())
})
