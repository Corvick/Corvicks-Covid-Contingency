/**
 * The build stamp Vite bakes in at compile time — see `shared/buildstamp.ts`
 * and the `define` in `vite.config.ts`. It is a literal by the time the browser
 * sees it, which is why there is no import for it anywhere.
 */
declare const __BUILD__: string;
