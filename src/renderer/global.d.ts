import type { JarvisBridge } from "../shared/types";

declare global {
  interface Window {
    jarvis?: JarvisBridge;
  }
}

export {};
