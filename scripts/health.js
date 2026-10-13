'use strict';

async function isUp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    return (await res.json()).app === 'home-base';
  } catch {
    return false;
  }
}

module.exports = { isUp };
