// Shared jsdom shims for the web test suite.

Object.defineProperty(window, 'Telegram', {
  writable: true,
  value: {
    WebApp: {
      initData: '',
      ready: () => {},
      expand: () => {},
    },
  },
});

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}
