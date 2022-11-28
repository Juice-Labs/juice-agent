import * as Logging from "./logging";
import { postWithTimeout } from "./fetchWithTimeout";

const FAIL_INTERVAL_MS = 5 * 1000;
const SUCCESS_INTERVAL_MS = 60 * 5 * 1000;

export function pingControllerLoop(controller: URL, localPort: number) {
  const pingUrl = new URL("/ping", controller);

  async function doPing() {
    try {
      await postWithTimeout(pingUrl, { port: localPort });
      Logging.debug(`Controller ping of ${pingUrl} complete`);
      setTimeout(doPing, SUCCESS_INTERVAL_MS);
    } catch (err) {
      Logging.error("Controller ping failed: %s", err);
      setTimeout(doPing, FAIL_INTERVAL_MS);
    }
  }

  doPing();
}
