// Renderer action registry integration entry.
// Concrete component definitions live in `ui/renderer-registry.ts` so UI components
// do not need to import from the integration layer.
export {
  rendererActionDefinitions,
  getRendererActionDefinition,
  createRendererActionDefinitions,
  type RendererActionDefinition,
  type RendererActionDefinitionBase,
} from "../ui/renderer-registry";
