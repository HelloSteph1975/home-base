export async function api(path, { method = 'GET', body } = {}) {
  const options = { method, headers: {} };
  if (method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body ?? {});
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error("Home Base isn't answering. If it was stopped, start it again and reload.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Home Base answered ${res.status}.`);
  return data;
}
