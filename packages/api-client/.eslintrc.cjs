module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.test.json",
    tsconfigRootDir: __dirname,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"],
  env: {
    es2021: true,
    node: true,
    jest: true,
  },
  // test-types/ is a tsc-only fixture (npm run typecheck:build) checked
  // against tsconfig.build-types.json, not this ESLint project's
  // tsconfig.test.json — linting it would need a second TS project
  // wired into parserOptions.project for one rarely-touched file.
  ignorePatterns: ["dist", "src/generated/**", "test-types/**"],
  rules: {
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
};
