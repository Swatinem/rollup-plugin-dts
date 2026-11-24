export interface Options {
    port: number;
}
export interface Config {
    host: string;
}
export interface State {
    ready: boolean;
}
export interface Props {
    name: string;
}
export interface Event {
    type: string;
}
export type ServerInput = Options | Config | State | Props | Event;
//# sourceMappingURL=server.d.ts.map