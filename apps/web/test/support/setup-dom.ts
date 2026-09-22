if (typeof globalThis.document === "undefined") {
  Object.defineProperty(globalThis, "document", {
    value: { defaultView: globalThis },
    writable: true,
  });
}
if (typeof globalThis.window === "undefined") {
  const historyMock = {
    state: null,
    replaceState: () => {},
    pushState: () => {},
  };
  const locationMock = {
    pathname: "/",
    search: "",
    hash: "",
    state: null,
  };

  Object.defineProperty(globalThis, "window", {
    value: {
      ...globalThis,
      history: historyMock,
      location: locationMock,
    },
    writable: true,
  });

  Object.defineProperty(globalThis, "history", {
    value: historyMock,
    writable: true,
  });

  Object.defineProperty(globalThis, "location", {
    value: locationMock,
    writable: true,
  });
}
