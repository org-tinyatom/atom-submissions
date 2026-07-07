// The canonical TinyAtom atom capability list, vendored from the app's `src/types/atom-ipc.ts`
// (`export const ATOM_CAPABILITIES`). The publish + check scripts validate every submission against
// exactly this set, so a submission can only declare capabilities the app knows how to grant.
//
// KEEP IN SYNC: when the app adds or removes a capability in `src/types/atom-ipc.ts`, update this list.
// It is the one thing that drifts between this repo and the app.
export const ATOM_CAPABILITIES = [
  'terminal',
  'clipboard',
  'notifications',
  'external-links',
  'filesystem',
  'storage',
  'database',
  'file-references',
  'network',
  'downloads',
  'secrets',
  'oauth',
  'camera',
  'microphone',
  'screen-capture',
  'system-info',
  'global-shortcuts',
  'tray-menu',
  'windows',
  'printer',
  'process',
  'serial',
  'bluetooth',
  'usb',
  'media',
  'speech',
  'geolocation',
  'midi',
  'gamepad',
  'power',
  'protocols',
];
