/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API in production, e.g. https://dda-api.onrender.com */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
