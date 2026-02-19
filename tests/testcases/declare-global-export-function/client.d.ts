import type { Config } from './types';

declare global {
    interface Window {
        __APP_CONFIG__?: Config;
    }
}

export declare function getConfig(): Config | undefined;
export declare function resetConfig(): void;
