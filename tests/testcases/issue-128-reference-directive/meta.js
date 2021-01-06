export default {
  rollupOptions: {
    input: ["main-a.d.ts", "main-b.d.ts"],
    output: { entryFileNames: ">[name]<.d.ts" },
  },
};
