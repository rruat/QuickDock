(function() {
  var isExt = (typeof chrome !== 'undefined' && !!chrome?.storage?.local) || (typeof location !== 'undefined' && location.protocol === 'chrome-extension:');
  var q = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search).get('platform') : null;
  var p = (q === 'extension' || q === 'mobile' || q === 'desktop') ? q : (isExt ? 'extension' : (window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop'));
  document.documentElement.dataset.platform = p;
  document.documentElement.classList.add('platform-' + p);
})();
