// @ts-check
/**
 * `node_modules/pkg-a` symlinks into `tests/pnpm-store/node_modules`, where its
 * transitive `pkg-b` sits as a sibling. This is pnpm's layout, reachable only
 * through realpath. With `preserveSymlinks` forced on, `value` becomes `any`.
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
