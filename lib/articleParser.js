// Article parser script to be injected into the WebView.
// Reads raw HTML from a <script id="raw-html"> tag, parses it with
// DOMParser, fixes lazy images, simplifies image markup, runs Readability,
// and renders the extracted article content into #article.
//
// NOTE: Readability.js must be loaded as a <script> tag in the page HTML
// before this script runs (it expects a global `Readability` function).
//
// NOTE: decodeBase64 is defined inline because this code runs inside a
// WebView as an injected string — we can't import modules here.
// See lib/base64.js for the shared implementation.

// Returns a JS string to be run as injectedJavaScript in the WebView,
// BEFORE the horizontalNavigation script (which measures dimensions).
export function getArticleParserScript() {
  return `
    (function() {
      try {
        var rawHtmlEl = document.getElementById('raw-html');
        if (!rawHtmlEl) return;

        function decodeBase64(str) {
          return decodeURIComponent(escape(atob(str)));
        }
        var rawHtml = decodeBase64(rawHtmlEl.textContent);
        var parser = new DOMParser();
        var doc = parser.parseFromString(rawHtml, 'text/html');

        // --- Fix lazy-loaded images ---
        function fixLazyImages(attr) {
          var images = doc.querySelectorAll('img[' + attr + ']');
          for (var i = 0; i < images.length; i++) {
            var lazySrc = images[i].getAttribute(attr);
            if (lazySrc) images[i].setAttribute('src', lazySrc);
          }
        }
        fixLazyImages('data-td-src-property');
        fixLazyImages('data-src');

        var pictures = doc.querySelectorAll('picture');
        for (var i = 0; i < pictures.length; i++) {
          var img = pictures[i].querySelector('img');
          var source = pictures[i].querySelector('source');
          if (img && source) {
            var srcset = source.getAttribute('srcset');
            if (srcset && (!img.getAttribute('src') || img.getAttribute('loading') === 'lazy')) {
              var firstSrc = srcset.split(',')[0].trim().split(/\\s+/)[0];
              if (firstSrc) {
                img.setAttribute('src', firstSrc);
                img.removeAttribute('loading');
              }
            }
          }
        }

        // --- Simplify image markup ---
        pictures = doc.querySelectorAll('picture');
        for (var i = 0; i < pictures.length; i++) {
          var img = pictures[i].querySelector('img');
          if (img) pictures[i].parentNode.replaceChild(img, pictures[i]);
        }

        var divs = Array.from(doc.querySelectorAll('figure div, section div')).reverse();
        for (var i = 0; i < divs.length; i++) {
          var children = Array.from(divs[i].children);
          if (children.length === 1 && (children[0].tagName === 'IMG' || children[0].tagName === 'DIV')) {
            divs[i].parentNode.replaceChild(children[0], divs[i]);
          }
        }

        // --- Run Readability ---
        var article = new Readability(doc, { nbTopCandidates: 3 }).parse();
        if (article) {
          var articleEl = document.getElementById('article');
          var content = '';

          var heroImgEl = document.getElementById('hero-image-url');
          if (heroImgEl && heroImgEl.textContent) {
            content += '<img src="' + heroImgEl.textContent + '" class="_hero-image_">';
          }
          if (article.title) {
            content += '<h1 class="_title_">' + article.title + '</h1>';
          }
          if (article.byline) {
            content += '<h2 class="_author_">' + article.byline + '</h2>';
          }
          content += article.content || '';
          articleEl.innerHTML = content;
        }
      } catch(e) {
        var el = document.getElementById('article');
        if (el) el.innerHTML = '<p>Failed to parse article: ' + e.message + '</p>';
      }
    })();
  `;
}
