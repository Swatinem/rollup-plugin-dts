// @ts-check
/**
 * `node_modules/pkg-a` symlinks into `tests/pnpm-store/node_modules`, where its
 * transitive `pkg-b` sits as a sibling — pnpm's layout, reachable only through
 * realpath. With `preserveSymlinks` forced on, `value` is inferred as `any`.
 *
 * @type {import('../../testcases').Meta}
 */
export default {
  options: {
    respectExternal: true,
  },
  rollupOptions: {
    external: [],
  },
};
