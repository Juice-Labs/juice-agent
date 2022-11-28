import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

import * as Logging from "./logging";
import * as Settings from "./settings";

export class Target extends EventEmitter {
  process: ChildProcess;
  client_uuid: string;
  logFile: string;

  constructor(target: ChildProcess, client_uuid: string, logFile: string) {
    super();

    this.process = target;
    this.client_uuid = client_uuid;
    this.logFile = logFile;

    // Set up some event listeners on the target
    this.process.on("exit", (code: number, signal: string) => {
      this.emit("exit", code, signal);
    });
    this.process.on("error", (err) => {
      Logging.error(err);
      this.emit("error", err);
    });
  }

  async destroy() {
    // Destroy the target process
    return new Promise<void>((resolve) => {
      if (!this.process.killed) {
        Logging.debug("Giving the target process a chance to exit nicely");
        this.process.kill("SIGINT");

        // Set a timeout
        const timeout = setTimeout(() => {
          if (!this.process.killed) {
            Logging.debug("Target process is still running, terminating");
            this.process.kill();
          }
        }, Settings.launchDestroySIGINTTimeout);

        const onExit = () => {
          Logging.debug("Target %s terminated", this.client_uuid);
          clearTimeout(timeout);
          resolve();
        };
        this.process.on("exit", onExit);
      } else {
        // Target is already dead, just resolve
        resolve();
      }
    });
  }
}
