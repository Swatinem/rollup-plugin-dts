interface Config {
    locale: string;
    debug: boolean;
}
declare global {
    interface Window {
        __APP_CONFIG__?: Config;
    }
}
declare function getConfig(): Config | undefined;
declare function resetConfig(): void;
export { getConfig, resetConfig };
