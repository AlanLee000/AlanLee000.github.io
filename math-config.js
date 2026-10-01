window.MathJax = {
  loader: {paths: {mathjax: '/vendor/mathjax'}, load: ['[tex]/mathtools', '[tex]/bussproofs']},
  tex: {inlineMath: [['\\(', '\\)']], displayMath: [['\\[','\\]']], packages: {'[+]': ['mathtools','bussproofs']}, processEscapes: true, tags: 'ams', maxBuffer: 100000, macros: window.FormalTexMacros || {}},
  output: {displayOverflow: 'linebreak', linebreaks: {inline: false, width: '100%', lineleading: .35}},
  chtml: {fontURL: '/vendor/mathjax-font/chtml/woff2', dynamicPrefix: '/vendor/mathjax-font/chtml/dynamic'},
  startup: {typeset: false},
  options: {enableMenu: false, skipHtmlTags: ['script','noscript','style','textarea','pre','code'], ignoreHtmlClass: 'no-math'}
};
