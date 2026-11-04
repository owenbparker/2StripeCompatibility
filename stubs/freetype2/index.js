// atem-connection loads this at startup but only uses it to draw multiviewer labels, which this module never does
function unavailable() {
	throw new Error('Multiviewer label drawing is not available in the 2-Stripe module')
}
module.exports = { NewMemoryFace: unavailable, NewFace: unavailable, RENDER_MODE_NORMAL: 0 }
