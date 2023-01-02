export default {
  rollupOptions: {
    input: [
      "packages/packi/index.ts",
      "packages/packi/src/entries/entry-a.ts",
      "packages/packi/src/entries/entry-b.ts",
    ],
    output: {
      entryFileNames: "[name].d.ts",
    },
  },
};
