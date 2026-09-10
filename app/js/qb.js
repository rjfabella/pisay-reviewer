/* Question bank registry.
   Each data file calls QB.add({...}) at load time, so everything works from
   file:// as well as from a web server (no fetch, no CORS). */
(function (global) {
  'use strict';

  var sets = [];

  var QB = {
    /* Called by every file in data/ */
    add: function (set) {
      set.questions.forEach(function (q) {
        q.uid = set.id + '-' + q.n;
        q.setId = set.id;
        q.subject = set.subject;
        q.section = set.section || null;
        q.source = set.source;
        q.setDirections = set.directions || null;
        q.passageText = q.p && set.passages ? set.passages[q.p] : null;
      });
      sets.push(set);
    },

    sets: function () { return sets; },

    all: function () {
      return sets.reduce(function (acc, s) { return acc.concat(s.questions); }, []);
    },

    byUid: function (uid) {
      var all = QB.all();
      for (var i = 0; i < all.length; i++) if (all[i].uid === uid) return all[i];
      return null;
    },

    /* [{name, count, sets:[...]}] ordered for display */
    subjects: function () {
      var order = ['Mathematics', 'Science', 'English', 'Abstract Reasoning', 'HEKASI'];
      var map = {};
      sets.forEach(function (s) {
        if (!map[s.subject]) map[s.subject] = { name: s.subject, count: 0, sets: [] };
        map[s.subject].count += s.questions.length;
        map[s.subject].sets.push(s);
      });
      return order.filter(function (n) { return map[n]; }).map(function (n) { return map[n]; });
    },

    /* [{name, count}] – the two reviewers */
    sources: function () {
      var map = {}, order = [];
      sets.forEach(function (s) {
        if (!map[s.source]) { map[s.source] = { name: s.source, count: 0 }; order.push(s.source); }
        map[s.source].count += s.questions.length;
      });
      return order.map(function (n) { return map[n]; });
    }
  };

  global.QB = QB;
})(window);
