import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import jsdoc from "eslint-plugin-jsdoc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: {
      jsdoc,
    },
    rules: {
      // Temporarily disable explicit-any rule for deployment
      // TODO: Fix all any types incrementally
      "@typescript-eslint/no-explicit-any": "warn",

      // JSDoc rules as warnings (encourage but don't block build)
      // Only require JSDoc on PUBLIC API (exported declarations)
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
          contexts: [
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSEnumDeclaration",
          ],
        },
      ],
      "jsdoc/require-description": "warn",
      "jsdoc/require-description-complete-sentence": "warn",
      "jsdoc/require-param": "warn",
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-param-name": "warn",
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns": "warn",
      "jsdoc/require-returns-description": "warn",
      "jsdoc/require-returns-type": "off",
      "jsdoc/check-alignment": "warn",
      "jsdoc/check-indentation": "warn",
      "jsdoc/check-param-names": "warn",
      "jsdoc/check-syntax": "warn",
      "jsdoc/check-tag-names": "warn",
      "jsdoc/check-types": "off",
      "jsdoc/valid-types": "off",
      "jsdoc/no-undefined-types": "off",
      "jsdoc/require-yields": "warn",
      "jsdoc/require-yields-check": "warn",
      "jsdoc/multiline-blocks": "warn",
      "jsdoc/no-multi-asterisks": "warn",
      "jsdoc/tag-lines": ["warn", "never"],
    },
    settings: {
      jsdoc: {
        mode: "typescript",
        tagNamePreference: {
          returns: "returns",
        },
      },
    },
  },
  {
    // Allow any types in test files and scripts (non-production code)
    files: [
      "**/__tests__/**/*",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "scripts/**/*",
      "tests/**/*",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
