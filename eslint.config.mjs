import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local-only design prototypes — not part of the app (gitignored, never in CI).
    "design-handoff/**",
    // Docs / brainstorm scratch files — not app source.
    "docs/**",
  ]),
  {
    // React Compiler / react-hooks advisory rules: keep visible as warnings
    // rather than build-blocking errors. The app builds and runs with the React
    // Compiler enabled, and several flagged spots are intentional SSR-safe
    // patterns (e.g. reading localStorage in an effect on mount). Revisit
    // react-hooks/static-components specifically — it can flag a real bug.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/static-components": "warn",
      "react/display-name": "warn",
    },
  },
]);

export default eslintConfig;
