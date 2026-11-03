// atem-connection runs its UDP socket through threadedclass, which loads './atemSocketChild' by file path at runtime.
// Inside the bundled module that file doesn't exist (Companion logged "Cannot find module ...atemSocketChild"), so
// the ATEM never connected. This swaps in a version that builds the socket class directly, in the same process.
import * as socketModule from 'atem-connection/dist/lib/atemSocket.js'
import * as childModule from 'atem-connection/dist/lib/atemSocketChild.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
const AtemSocket: any = (socketModule as any).AtemSocket ?? (socketModule as any).default?.AtemSocket
const AtemSocketChild: any = (childModule as any).AtemSocketChild ?? (childModule as any).default?.AtemSocketChild

if (!AtemSocket || !AtemSocketChild) throw new Error('atem-connection internals changed; update atem-in-process.ts')

AtemSocket.prototype._createSocketProcess = async function (this: any) {
	this._socketProcess = new AtemSocketChild(
		{ address: this._address, port: this._port, debugBuffers: this._debugBuffers },
		async () => this.emit('disconnect'),
		async (message: string) => this.emit('info', message),
		async (payload: Buffer) => this._parseCommands(Buffer.from(payload)),
		async (ids: Array<{ trackingId: number }>) => this.emit('ackPackets', ids.map((id) => id.trackingId)),
	)
}

// Report what the ATEM says when it answers the first hello, since a full ATEM (too many control clients) answers
// and then goes silent, which otherwise looks like a dropped connection.
const receive = AtemSocketChild.prototype._receivePacket
AtemSocketChild.prototype._receivePacket = function (this: any, packet: Buffer, rinfo: { address: string; size: number }) {
	const flags = packet.length >= 12 ? packet.readUInt8(0) >> 3 : 0
	if (flags & 0x02) {
		const payload = packet.subarray(12)
		const refused = payload[0] === 0x03
		console.log(
			`2-Stripe ATEM ${rinfo.address} answered the connection (${payload.toString('hex') || 'empty'})` +
				(refused ? ': it refused, probably because it already has as many control clients as it allows' : ''),
		)
	}
	return receive.call(this, packet, rinfo)
}

AtemSocket.prototype.destroy = async function (this: any) {
	await this.disconnect()
	if (this._creatingSocket) await this._creatingSocket.catch(() => null)
	this._socketProcess = undefined
}
