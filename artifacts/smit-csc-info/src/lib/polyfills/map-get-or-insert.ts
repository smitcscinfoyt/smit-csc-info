// Polyfill for `Map.prototype.getOrInsertComputed` and `Map.prototype.getOrInsert`.
//
// pdfjs-dist 5.6.x — used in the ID-card engine, PDF editor, PDF→Word,
// PDF→Text and Prime Studio uploads — depends on these methods, but they
// are TC39 Stage-2 proposals (March 2025) and are NOT yet shipped in any
// stable browser engine. Without this polyfill PDF rendering crashes
// the moment any PDF is opened with:
//   "this[#methodPromises].getOrInsertComputed is not a function"
//
// Loaded once at app boot from main.tsx so every code path that uses
// pdfjs is automatically protected.

const proto = Map.prototype as unknown as {
  getOrInsertComputed?: (key: unknown, makeValue: (k: unknown) => unknown) => unknown;
  getOrInsert?: (key: unknown, defaultValue: unknown) => unknown;
};

if (typeof proto.getOrInsertComputed !== "function") {
  proto.getOrInsertComputed = function (
    this: Map<unknown, unknown>,
    key: unknown,
    makeValue: (k: unknown) => unknown,
  ) {
    if (this.has(key)) return this.get(key);
    const value = makeValue(key);
    this.set(key, value);
    return value;
  };
}

if (typeof proto.getOrInsert !== "function") {
  proto.getOrInsert = function (
    this: Map<unknown, unknown>,
    key: unknown,
    defaultValue: unknown,
  ) {
    if (this.has(key)) return this.get(key);
    this.set(key, defaultValue);
    return defaultValue;
  };
}

export {};
