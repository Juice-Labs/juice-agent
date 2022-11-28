export type Options = {
  quiet: boolean;
  verbose: number;
  nobanner: boolean;

  port: number;
  ip: string;

  launcher?: string;
  launcherArgs?: string[]
  controller?: string;
  influxConfig?: string;
  maxClients?: number;
  roundrobin: boolean;
  timeout: number
};

var argsParser = require("yargs/yargs")(process.argv.slice(2))
  .config()
  .option("quiet", {
    alias: "q",
    description: "Prevents all output",
    type: "boolean",
    default: false,
  })
  .option("controller", {
    description: "URL of controller",
    type: "string",
  })
  .option("influx-config", {
    alias: "influxConfig",
    description: "URL of influxdb host",
    type: "string",
  })
  .option("verbose", {
    alias: "v",
    description: "Increases the verbosity level, defaults to errors only",
    type: "count",
  })
  .option("nobanner", {
    description: "Prevents the output of the application banner",
    type: "boolean",
    default: false,
  })
  .option("ip", {
    description: "IP address to bind",
    type: "string",
    default: "0.0.0.0",
  })
  .option("port", {
    alias: "p",
    description: "Port to bind",
    type: "number"
  })
  .option("launcher", {
    description: "Specifies the path to the binary to launch",
    type: "string",
  })
  .option("max-clients", {
    alias: "maxClients",
    description: "maximum number of clients allowed",
    type: "number",
  })
  .option("timeout_ms", {
    alias: "timeout",
    description: "maximum timeout waiting for Renderer_Win to start, default 1000ms",
    type: "number",
    default: 5000
  })
  .help()
  .alias("help", "h").argv;

export const argv: Options = argsParser
argv.launcherArgs = argsParser._
