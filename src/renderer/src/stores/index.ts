// Root store barrel: re-export all domain stores so components can import from
// `@renderer/stores` instead of memorizing per-domain paths.
export * from "./platform";
export * from "./workspace";
export * from "./session";
export * from "./proposal";
export * from "./insight";
export * from "./automation";
