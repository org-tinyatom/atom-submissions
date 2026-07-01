// Starter logic for Smoke Atom. The host exposes a narrow, capability-filtered API on
// window.tinyAtom; there is no other host global. Identity + capability checks are enforced in main.
const tinyAtom = window.tinyAtom;

async function init() {
  const meta = await tinyAtom.metadata();
  document.getElementById('meta').textContent = meta.id + ' v' + meta.version;
}

// This atom declares no capabilities. Add one to its manifest (and re-sign) to use native features.

init().catch((error) => console.error('atom init failed', error));
