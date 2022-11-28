import fetch from "node-fetch";
import AbortController from "abort-controller";

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  url: string | URL,
  method: string,
  body?: any
): Promise<any> {
  const abort = new AbortController();
  const timeout = setTimeout(() => {
    abort.abort();
  }, TIMEOUT_MS);

  let bodyInfo = {};
  if (body !== undefined) {
    bodyInfo = {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  const res = await fetch(url.toString(), {
    method,
    signal: abort.signal,
    ...bodyInfo,
  });

  if (!res.ok) {
    throw Error(res.statusText);
  }

  const payload = await res.json();

  clearTimeout(timeout);

  return payload;
}

export async function getWithTimeout(url: string | URL): Promise<any> {
  return await fetchWithTimeout(url, "GET", undefined);
}

export async function postWithTimeout(
  url: string | URL,
  body: any
): Promise<any> {
  try
  {
    return await fetchWithTimeout(url, "POST", body);
  }
  catch(err)
  {
    // If we don't catch the AbortError all is lost.
  }
}
