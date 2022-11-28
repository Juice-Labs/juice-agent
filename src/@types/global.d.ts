declare module NodeJS {
  type AgentVersion = {
    version: string;
  };
  interface Global {
    agent: AgentVersion;
  }
}
