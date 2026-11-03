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

AtemSocket.prototype.destroy = async function (this: any) {
	await this.disconnect()
	if (this._creatingSocket) await this._creatingSocket.catch(() => null)
	this._socketProcess = undefined
}
