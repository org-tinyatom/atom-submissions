/**
 * Frame ticker — the compositor's clock while the studio window is in the background.
 *
 * A screen recorder is used precisely while its own window is hidden or occluded, and
 * Chromium stops requestAnimationFrame and throttles page timers to roughly 1Hz there.
 * Driving the canvas draw loop from the page would freeze the recorded video on the
 * frame the user left. Worker timers keep their interval while the page is hidden, so
 * the studio composites from here and only falls back to rAF if this worker cannot be
 * constructed.
 *
 * Protocol: { type: 'start', fps } begins ticking, { type: 'stop' } ends it, and each
 * tick posts 'tick' back to the page, which draws one frame.
 */

let timer = null;

function stop() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === 'start') {
    stop(); // a restart (frame rate change) must not leave two intervals running
    const fps = Number(message.fps) > 0 ? Number(message.fps) : 30;
    timer = setInterval(() => self.postMessage('tick'), Math.max(1, Math.round(1000 / fps)));
  } else if (message.type === 'stop') {
    stop();
  }
};
