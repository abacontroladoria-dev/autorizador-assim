// Wildcard module declaration for @nina/* imports.
// These are resolved at build time via the webpack `@nina` alias
// (pointing to nina-api-oficial/src). TypeScript treats them as `any`.
declare module '@nina/*';
