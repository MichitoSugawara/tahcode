/// <reference types="vite/client" />

declare module "*.wasm?url" {
  const src: string;
  export default src;
}

declare module "*.wasm?url&no-inline" {
  const src: string;
  export default src;
}
