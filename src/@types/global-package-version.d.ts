declare module "global-package-version" {
  interface Options {
    wrapper?: string;
    customPackageName?: string;
  }
  function globalPackageVersion(packageJson: string, options?: Options): void;
  export = globalPackageVersion;
}
