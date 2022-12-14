import * as fs from "fs/promises";
import express from "express";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import {promisify} from "util";
import {exec} from "child_process";

const execAsync = promisify(exec);

import * as CommandLine from "../src/commandline";
import * as Logging from "../src/logging";

// Initialize the logging system here to allow imports to use it
Logging.configure(CommandLine.argv);

import { Router, CreateOptions } from "../src/router";
import { postWithTimeout } from "../src/fetchWithTimeout";

async function getHostname() {
  const hostProcess = await execAsync("hostname");
  const lines = hostProcess.stdout.split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length !== 1) {
    throw Error(`unexpected output from hostname: ${hostProcess.stdout}`);
  }
  return lines[0];
}

async function main(): Promise<void> {
  if (!CommandLine.argv.nobanner) {
    Logging.always("Juice Agent, version %s", process.env.npm_package_version);
    Logging.always("Copyright 2021-2022 Juice Technologies, Inc.");
  }

  if (CommandLine.argv.launcher === undefined) {
    throw "launcher is undefined";
  }

  try {
    await fs.mkdir(CommandLine.argv.logs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }

  const hostname = await getHostname();
  Logging.always(`Hostname: ${hostname}`);

  const startTime = new Date().getTime();

  let data = await require('../src/graphics.js').graphics();

  var currentControllers: any[];
  currentControllers = data.controllers;

  const app = express();
  app.use(morgan("combined"));
  app.use(express.json());
  app.use(
    express.urlencoded({
      extended: true,
    })
  );

  const router = new Router(CommandLine.argv.launcher);

  async function Connect(res: any, port: number, options: CreateOptions & {id?: string}) {
    const maxClients = CommandLine.argv.maxClients;
    if (maxClients !== undefined && router.count >= maxClients) {
      res.status(529).send('too many clients, try again later');
      return
    }

    try {
      const id = options?.id ?? uuidv4();

      await router.create(id, CommandLine.argv.launcherArgs, options);
      res.status(200).json({ port: port, id: id });
    } catch (e) {
      Logging.error(e);
      res.status(500).send(e);
    }
  };

  // The interface for the agent's /connect call should match the controllers,
  // except the agent does not return an IP address
  app
    .get('/connect', async (req, res) => {
      const pcibus = req.query.pcibus as string;
      const id = req.query.id as string;

      let options = {};
      if(id !== undefined && id.length > 0) {
        const idCheck = /W+/g;
        if(!idCheck.test(id)) {
          res.status(400).send("invalid id");
          return;
        }
      }

      if(pcibus !== undefined && pcibus.length > 0) {
        let deviceUuid : string | undefined = undefined;
        currentControllers.every(controller => {
          const address = (controller.busAddress as string).toLowerCase();
          const targetAddress = pcibus.toLowerCase();

          if(address.includes(targetAddress))
          {
            deviceUuid = controller.uuid;
            return false;
          }

          return true;
        });

        if(deviceUuid === undefined)
        {
          // CUDA device not found at PCI bus address
          res.status(400).send("pci bus device not found");
          return;
        }

        options = {
          ...options,
          pcibus: pcibus,
          deviceUuid: deviceUuid
        };
      }

      Connect(res, req.socket.localPort, options);
    })
    .post('/:client_id/connect', async (req, res) => {
      const client_id = req.params.client_id;

      try {
        // Pause reads on the socket so that messages from the Juice client
        // aren't read by the agent.  There is a race between the forwarded
        // socket being written to by the client and the socket being closed
        // by Node.js.  This happens because the client proceeds once it
        // receives the HTTP response from Renderer_Win and Node.js closes
        // its handle to the forwarded socket only once the IPC ack is
        // received from Renderer_Win -- until the socket is closed Node.js
        // will happily to read and ignore any data that arrives on that
        // socket.
        req.socket.pause();

        if(!await router.forward(client_id, req.socket))
          res.status(500).send(`${client_id} not found`);
        // Just end the response as the socket is forwarded to Renderer_Win
      } catch (e) {
        Logging.error(e);
        res.status(500).send(e);
      }
    });

  function getStatus() {
    const uptimeMs = new Date().getTime() - startTime;
    return {
      uptime_ms: uptimeMs,
      num_sessions: router.targets.length,
    }
  }

  app.get("/status", async (req, res) => {
    const graphics = require('../src/graphics.js').graphics;

    let data = await graphics();

    currentControllers = data.controllers;

    let result = {
      status: "ok",
      hostname: hostname,
      controllers: data.controllers,
      ...getStatus()
    };

    try {
      res.status(200).json(result);
    } catch (e) {
      Logging.error(e);
      res.status(500).send(e);
    }
  });

  process.on("SIGINT", async () => {
    await router.destroy();
    process.exit(0);
  });

  app.listen(CommandLine.argv.port, CommandLine.argv.ip, async () => {
    console.log(`Listening at http://${CommandLine.argv.ip}:${CommandLine.argv.port}`);

    // Start gpu status broadcast
    var dgram = require("dgram");
    var gpuBroadcastSocket = dgram.createSocket("udp4");
    gpuBroadcastSocket.bind(function () {
      gpuBroadcastSocket.setBroadcast(true);
    });

    // Get the list of broadcast addresses on active adapters on the system
    const ipaddr = require('ipaddr.js');
    const os = require("os");

    const broadcastAddresses: string[] = [];
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
      for (let i in interfaces[iface]) {
        const f = interfaces[iface][i];
        if (f.family === "IPv4") {
          broadcastAddresses.push(ipaddr.IPv4.broadcastAddressFromCIDR(f.cidr).toString());
        }
      }
    }

    var nonce = 0;
    const host_uuid = uuidv4();
    
    const UDP_INTERVAL_MS = 1000;
    const FAIL_INTERVAL_MS = 5; /* * UDP_INTERVAL_MS; */
    const SUCCESS_INTERVAL_MS = 60 * 5; /* * UDP_INTERVAL_MS; */
    const controller = CommandLine.argv.controller;
    
    var controllerPingLast = 0;
    var currentGPUCount = 0;

    setInterval(function() {

      var si = require('../src/graphics.js');
      si.graphics().then((data: { controllers: any[]; }) => {

        // Fix the controller list.
        let updateControllers : any[] = [];

        currentControllers = data.controllers;

        data.controllers.forEach(cont => {
          if(cont.vram > 512)
          {
            updateControllers.push(cont);
          }
        });

        var gpu: {[k: string]: any} = {};
        gpu.hostname = hostname;
        gpu.port = CommandLine.argv.port;
        gpu.uuid = host_uuid;
        gpu.action = "UPDATE";
        gpu.nonce = nonce;
        gpu.gpu_count = updateControllers.length;
        gpu.data = updateControllers;
        var jsonGpuData = JSON.stringify(gpu);
        
        var message = Buffer.from(jsonGpuData);

        // For each adapter, broadcast the packet. Needed because
        // on Windows the OS will not do this for you. Linux does,
        // however.
        broadcastAddresses.forEach(address => {
          gpuBroadcastSocket.send(message, 0, message.length, CommandLine.argv.port, address); 
        });

        if (controller !== undefined) 
        {
          if((controllerPingLast <= 0) || (currentGPUCount != gpu.gpu_count))
          {
            controllerPingLast = SUCCESS_INTERVAL_MS;

              const controllerUrl = new URL(controller);
              const pingUrl = new URL("/ping", controllerUrl);
          
              try {
                postWithTimeout(pingUrl, gpu);
              } catch (err) {
                controllerPingLast = FAIL_INTERVAL_MS;
              }
          }

          --controllerPingLast;
        }

        currentGPUCount = gpu.gpu_count;

        nonce++;
      });
    }, UDP_INTERVAL_MS);

    if (controller !== undefined) 
    {
      process.on('SIGTERM', () => {
        var gpu: {[k: string]: any} = {};
        gpu.hostname = hostname;
        gpu.port = CommandLine.argv.port;
        gpu.uuid = host_uuid;
        gpu.action = "UPDATE";
        gpu.nonce = nonce;
        gpu.gpu_count = 0;
        gpu.data = [];

        const controllerUrl = new URL(controller);
        const pingUrl = new URL("/ping", controllerUrl);
    
        try {
          postWithTimeout(pingUrl, gpu);
        } catch (err) {
        }
     });
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
