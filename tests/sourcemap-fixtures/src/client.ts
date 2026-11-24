export interface Options { url: string }
export interface Config { retries: number }
export interface State { connected: boolean }
export interface Props { id: string }
export interface Event { data: string }
export type ClientInput = Options | Config | State | Props | Event;
