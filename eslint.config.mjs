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
      // Require JSDoc comments for all functions and classes
      "jsdoc/require-jsdoc": [
        "error",
        {
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
      // Require descriptions in JSDoc
      "jsdoc/require-description": "error",
      "jsdoc/require-description-complete-sentence": "warn",
      // Require parameter documentation
      "jsdoc/require-param": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-param-name": "error",
      "jsdoc/require-param-type": "off", // TypeScript handles types
      // Require return documentation
      "jsdoc/require-returns": "error",
      "jsdoc/require-returns-description": "error",
      "jsdoc/require-returns-type": "off", // TypeScript handles types
      // Check JSDoc validity
      "jsdoc/check-alignment": "error",
      "jsdoc/check-indentation": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/check-syntax": "error",
      "jsdoc/check-tag-names": "error",
      "jsdoc/check-types": "off", // TypeScript handles types
      "jsdoc/valid-types": "off", // TypeScript handles types
      // Additional quality rules
      "jsdoc/no-undefined-types": "off", // TypeScript handles types
      "jsdoc/require-yields": "error",
      "jsdoc/require-yields-check": "error",
      // Formatting rules
      "jsdoc/multiline-blocks": "error",
      "jsdoc/no-multi-asterisks": "error",
      "jsdoc/tag-lines": ["error", "never"],
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
