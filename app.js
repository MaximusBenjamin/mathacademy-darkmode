// Task-type tagger: stamps data-ma-type on task cards so theme.css can
// color-code them (CSS cannot select on the label text itself).
(function () {
  'use strict';

  var TYPES = ['lesson', 'review', 'multistep', 'assessment'];

  function stamp() {
    var headers = document.querySelectorAll('.taskHeader');
    for (var i = 0; i < headers.length; i++) {
      var span = headers[i].querySelector(':scope > span');
      if (!span) continue;
      var t = span.textContent.trim().toLowerCase();
      if (TYPES.indexOf(t) !== -1) headers[i].parentElement.setAttribute('data-ma-type', t);
    }
  }

  stamp();
  if (document.body) {
    new MutationObserver(stamp).observe(document.body, { childList: true, subtree: true });
  }
})();
