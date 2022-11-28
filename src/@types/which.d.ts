declare module "which" {
  function which(cmd: string): Promise<string>;
  export = which;
}
