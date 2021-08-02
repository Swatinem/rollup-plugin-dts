declare namespace Services {
  type Type = "ServiceType";
}
declare class Services {}
declare class Client {}
declare namespace Client {
  export import Services = Services;
}
export { Client };
