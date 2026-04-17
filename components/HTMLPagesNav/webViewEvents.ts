export function getWebViewEvents(webViewName: string) {
  const name = (name: string) => `${webViewName}_${name}`;

  return {
    SWIPE_NEXT: name("SWIPE_NEXT"),
    SWIPE_PREVIOUS: name("SWIPE_PREVIOUS"),
    SWIPE_TOP: name("SWIPE_TOP"),
    SWIPE_BOTTOM: name("SWIPE_BOTTOM"),
    ON_LOAD: name("ON_LOAD"),
    ON_LOAD_ERROR: name("ON_LOAD_ERROR"),
    HANDLE_LINK: name("HANDLE_LINK"),
    HANDLE_ROUTER_LINK: name("HANDLE_ROUTER_LINK"),
    _CONSOLE_: name("_CONSOLE_"),
  };
}
