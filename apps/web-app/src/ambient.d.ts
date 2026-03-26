import "svelte/elements";

declare module "svelte/elements" {
  interface HTMLInputAttributes {
    webkitdirectory?: boolean;
  }
}
