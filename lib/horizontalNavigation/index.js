const styles = `
  * {
    font-family: var(--fontFamilySerif);
    font-weight: normal;
  }

  html,
  body {
    font-size: var(--fontSizeMain);
    font-family: var(--fontFamilySerif);
    display: flex;
    flex-grow: 1;
    user-select: none;
    align-items: center;
    margin: 0;
    padding: 0;
    background-color: var(--colorBackground);
    color: var(--colorText);
  }

  #viewport {
    column-width: var(--articleColumnWidth);
    column-gap: 0;
    height: 100%;
    width: auto;
    overflow-x: hidden;
    background-color: var(--colorBackground);
    color: var(--colorText);
  }

  #article {
    width: auto;
    min-width: var(--articleColumnWidth);
  }

  p,
  ul,
  ol {
    font-size: 1rem;
    text-align: justify;
    text-align-last: left;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  a { 
    color: var(--colorText);
  }

  img, 
  iframe {
    max-width: 100%;
    height: auto;
    aspect-ratio: 4/3 auto;
  }

  figure,
  picture {
    break-inside: avoid;
  }

  picture,
  figcaption {
    font-style: italic;
    font-size: var(--fontSizeSmall);
  }

  ._title_ {
    font-size: 1.6rem;
    line-height: 1em;
    margin: 0 0 1em 0;
  }

  ._author_ {
    font-size: .8rem;
    line-height: 1em;
    font-style: italic;
    font-weight: bold;
    margin: 0 0 1em 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-size: 1.2rem;
    line-height: 1em;
    margin: 0 0 1em 0;
  }

  h1 {
    font-size: 1.5rem;
  }

  h2 {
    font-size: 1.4rem;
  }

  h3 {
    font-size: 1.3rem;
  }

  code,
  code p,
  pre p,
  pre {
    font-size: 0.7rem;
    font-family: var(--fontFamilyMono), SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    white-space: pre-wrap;
    padding: 0.5rem;
  }

  p code,
  li code {
    padding: 0;
  }
`;

export const script = ({ ON_LOAD, HANDLE_LINK, HANDLE_ROUTER_LINK }) => `
  const viewportEl = document.getElementById("viewport");
  const articleEl = document.getElementById("article");
  const viewportWidth = viewportEl.getBoundingClientRect().width;
  const articleWidth = articleEl.getBoundingClientRect().width;

  window.ReactNativeWebView.postMessage(JSON.stringify({
    viewportWidth,
    articleWidth,
    eventName: '${ON_LOAD}',
  }))

  // send back to component the events created using 
  // webviewRef.current?.postMessage(direction);
  document.addEventListener("message", function(event) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      viewportWidth,
      articleWidth,
      eventName: event.data,
    }))
  }, false);

  // Handle links
  // Prevent links to execute default action
  // Dispatch event with the href data
  const links = document.querySelectorAll('a');
  const routeLinks = document.querySelectorAll('[data-route-link]');

  links?.forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      window.ReactNativeWebView.postMessage(JSON.stringify({
        href: link.href,
        eventName: '${HANDLE_LINK}',
      }))
    });
  });

  routeLinks?.forEach(link => {
    function handleClick(event) {
      event.preventDefault();
      const path = event.currentTarget.getAttribute('data-route-link');


      window.ReactNativeWebView.postMessage(JSON.stringify({
        path,
        eventName: '${HANDLE_ROUTER_LINK}',
      }))
    } 

    link.addEventListener('click', handleClick);
  });
`;

export function getHorizontalNavigationPage({ content, width, theme }) {
  return `
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,500;0,700;1,500;1,700&family=JetBrains+Mono:ital,wght@0,500;0,700;1,500;1,700&display=swap");

      :root {
        --fontFamilySerif: "Alegreya", "Georgia", "Times", "Times New Roman", serif;
        --fontFamilySans: sans-serif;
        --fontFamilyMono: "JetBrains Mono", monospace;

        --fontSizeSmall: ${theme.fonts.fontSizeSmall}px;
        --fontSizeMain: ${theme.fonts.baseFontSize}px;

        --articleColumnWidth: ${width}px;

        --colorText: ${theme.colors.text};
        --colorBackground: transparent;
        --colorTint: ${theme.colors.tint};
        --colorIcon: ${theme.colors.icon};
        --colorBorderDark: ${theme.colors.borderDark};
        --colorBackgroundDark: ${theme.colors.backgroundDark};
        --colorBackgroundDark_text: ${theme.colors.backgroundDark_text};
      } 

      ${styles}
    </style>

    <main id="viewport" lang="es">
      <div id="article">
        ${content}
      </div>
    </main>
  `;
}
