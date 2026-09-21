const templates = {
  '2p-simple': () => import('./2p-simple.js'),
  '2p-pair1': () => import('./2p-pair1.js'),
  'pattern-header': () => import('./pattern-header.js'),
  '30p-pair': () => import('./30p-pair.js'),
  'main-tweet': () => import('./main-tweet.js')
};

export async function loadTemplate(id) {
  if (!Object.hasOwn(templates, id)) return null;
  const { default: definition } = await templates[id]();
  const { size, tabs, initialState, createScene, fields } = definition;
  if (definition.templateId !== id || !size ||
      !Number.isSafeInteger(size.width) || size.width <= 0 ||
      !Number.isSafeInteger(size.height) || size.height <= 0 ||
      typeof initialState !== 'function' || typeof createScene !== 'function' ||
      typeof fields !== 'function') throw new Error(T("registry.001"));
  const items = typeof tabs === 'function' ? tabs(initialState()) : tabs;
  if (!Array.isArray(items) || !items.some(t => t.type !== 'action') ||
      new Set(items.map(t => t.id)).size !== items.length) throw new Error(T("registry.002"));
  return definition;
}
