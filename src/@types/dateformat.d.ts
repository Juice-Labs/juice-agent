declare module "dateformat" {
  function dateformat(): string;
  function dateformat(date: Date): string;
  function dateformat(mask: string): string;
  function dateformat(date: Date, mask: string): string;
  function dateformat(date: Date, mask: string, utc: boolean): string;
  export default dateformat;
}
