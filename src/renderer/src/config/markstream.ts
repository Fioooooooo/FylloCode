import {
  clearKaTeXWorker,
  clearMermaidWorker,
  enableMermaid,
  isCodeBlockRuntimeReady,
  preloadCodeBlockRuntime,
  setKaTeXWorker,
  setMermaidLoader,
  setMermaidWorker,
  terminateWorker,
} from "markstream-vue";
import KatexWorker from "markstream-vue/workers/katexRenderer.worker?worker&inline";
import MermaidWorker from "markstream-vue/workers/mermaidParser.worker?worker&inline";

const globalScope = globalThis as typeof globalThis & {
  __markdownWorkers?: {
    katex: Worker;
    mermaid: Worker;
  };
};

if (!globalScope.__markdownWorkers) {
  const katex = new KatexWorker();
  const mermaid = new MermaidWorker();
  globalScope.__markdownWorkers = { katex, mermaid };
  setKaTeXWorker(katex);
  setMermaidWorker(mermaid);
  const loadMermaid = (): Promise<typeof import("mermaid").default> =>
    import("mermaid").then((m) => m.default);
  setMermaidLoader(loadMermaid);
  enableMermaid(loadMermaid);
}

if (typeof window !== "undefined") {
  void preloadCodeBlockRuntime().catch((err) => {
    console.error("[markstream] preloadCodeBlockRuntime failed:", err);
  });
  void Promise.resolve(isCodeBlockRuntimeReady());
}

window.addEventListener("beforeunload", () => {
  const workers = globalScope.__markdownWorkers;
  if (workers) {
    workers.katex.terminate();
    workers.mermaid.terminate();
    globalScope.__markdownWorkers = undefined;
  }
  clearKaTeXWorker();
  clearMermaidWorker();
  terminateWorker();
});
