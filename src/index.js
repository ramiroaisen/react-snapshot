export const prerendering = typeof window.reactSnapshotRender === "function";

export const takeSnapshot = prerendering ? window.reactSnapshotRender : () => {};