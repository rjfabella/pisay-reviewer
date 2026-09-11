/* ============================================================
   Pisay Reviewer — application logic
   Static, no backend. Progress is saved in localStorage.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- small helpers ---------------- */
  var $  = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* *word* -> <em>word</em>, applied after escaping */
  function rich(s) {
    return esc(s).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pct(c, t) { return t ? Math.round((c / t) * 100) : 0; }
  function mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  /* ---------------- persistence ---------------- */
  var KEY = 'pisay.v1';
  var db = { theme: null, lastUser: null, users: {} };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          db = { theme: parsed.theme || null, lastUser: parsed.lastUser || null, users: parsed.users || {} };
        }
      }
    } catch (e) { /* private mode, blocked storage — carry on with defaults */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }

  function blankUser(name) {
    return {
      name: name, xp: 0, answered: 0, correct: 0, quizzes: 0, bestStreak: 0,
      subjects: {}, badges: [], sessions: [], days: [], dayStreak: 0,
      explanationsRead: 0, seen: {}
    };
  }
  /* Normalise a stored profile; also used for profiles other than the signed-in one */
  function normalizeUser(u) {
    if (!u.subjects) u.subjects = {};
    if (!u.badges) u.badges = [];
    if (!u.days) u.days = [];
    if (!u.seen) u.seen = {};
    if (!u.sessions) {
      /* Profiles from the first build only kept a one-line summary per session.
         Carry those over so nothing disappears; they just have no per-answer detail. */
      u.sessions = (u.history || []).map(function (h) {
        return { at: null, when: h.when, title: h.title, correct: h.correct, total: h.total,
                 pct: h.pct, xp: h.xp, elapsed: null, bestStreak: null,
                 timer: null, feedback: null, items: [] };
      });
      delete u.history;
    }
    return u;
  }
  function getUser(name) {
    var k = name.toLowerCase();
    if (!db.users[k]) db.users[k] = blankUser(name);
    return normalizeUser(db.users[k]);
  }
  function allUsers() {
    return Object.keys(db.users).map(function (k) { return normalizeUser(db.users[k]); });
  }

  /* ---------------- levels & badges ---------------- */
  var LEVELS = [
    { xp: 0,    title: 'Bagong Iskolar' },
    { xp: 150,  title: 'Masipag na Mag-aaral' },
    { xp: 400,  title: 'Batang Siyentista' },
    { xp: 800,  title: 'Tagapaglutas' },
    { xp: 1400, title: 'Mahusay na Iskolar' },
    { xp: 2200, title: 'Bihasang Iskolar' },
    { xp: 3200, title: 'Iskolar ng Agham' },
    { xp: 4500, title: 'Pisay Aspirant' },
    { xp: 6000, title: 'Pisay Ready' },
    { xp: 8000, title: 'Iskolar ng Bayan' }
  ];
  function levelOf(xp) {
    var i = 0;
    for (var k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].xp) i = k;
    return {
      index: i, num: i + 1, title: LEVELS[i].title,
      floor: LEVELS[i].xp,
      ceil: i + 1 < LEVELS.length ? LEVELS[i + 1].xp : null
    };
  }

  var BADGES = [
    { id: 'first',    ico: '🎯', name: 'First Steps',   desc: 'Finish your first session' },
    { id: 'streak10', ico: '🔥', name: 'On Fire',       desc: '10 correct in a row' },
    { id: 'perfect',  ico: '💯', name: 'Flawless',      desc: '100% on 10+ questions' },
    { id: 'marathon', ico: '🏃', name: 'Marathon',      desc: 'Finish 50+ questions at once' },
    { id: 'rounded',  ico: '🌏', name: 'Well-Rounded',  desc: 'Try all five subjects' },
    { id: 'century',  ico: '🧠', name: 'Century',       desc: 'Answer 100 questions total' },
    { id: 'speed',    ico: '⚡', name: 'Quick Thinker', desc: 'Under 15s each at 80%+' },
    { id: 'clock',    ico: '⏱️', name: 'Beat the Clock', desc: 'Finish timed with time left' },
    { id: 'bookworm', ico: '📖', name: 'Bookworm',      desc: 'Read 25 explanations' },
    { id: 'daily',    ico: '📅', name: 'Dedicated',     desc: 'Practice 3 days in a row' }
  ];

  /* ---------------- app state ---------------- */
  var user = null;
  var setup = { mode: 'quick', subjects: [], sources: [], count: 20, timer: 0, feedback: 'instant' };
  var S = null;                       /* live session */
  var reviewOnlyMissed = false;

  /* ---------------- screens ---------------- */
  function show(id) {
    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    $(id).classList.add('active');
    var sc = $(id).querySelector('.scroll');
    if (sc) sc.scrollTop = 0;
  }

  function toast(msg) {
    var t = el('div', 'toast', esc(msg));
    $('toast-wrap').appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }

  /* ---------------- theme ---------------- */
  function applyTheme() {
    if (db.theme) document.documentElement.setAttribute('data-theme', db.theme);
    else document.documentElement.removeAttribute('data-theme');
  }
  $('btn-theme').addEventListener('click', function () {
    var isDark = db.theme
      ? db.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    db.theme = isDark ? 'light' : 'dark';
    applyTheme(); save();
  });

  /* ============================================================
     LOGIN
     ============================================================ */
  function renderKnownUsers() {
    var keys = Object.keys(db.users);
    if (!keys.length) { $('known-users').hidden = true; return; }
    $('known-users').hidden = false;
    var list = $('known-users-list');
    list.innerHTML = '';
    keys.map(function (k) { return db.users[k]; })
      .sort(function (a, b) { return b.xp - a.xp; })
      .slice(0, 8)
      .forEach(function (u) {
        var b = el('button', 'known-chip',
          esc(u.name) + ' <small>Lv ' + levelOf(u.xp).num + '</small>');
        b.type = 'button';
        b.addEventListener('click', function () { signIn(u.name); });
        list.appendChild(b);
      });
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('name-input').value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    signIn(name);
  });

  function signIn(name) {
    user = getUser(name);
    user.name = name;                 /* keep the latest capitalisation */
    db.lastUser = name;
    touchDayStreak();
    save();
    renderHome();
    show('screen-home');
  }

  function touchDayStreak() {
    var t = today();
    if (user.days.indexOf(t) !== -1) return;
    var last = user.days[user.days.length - 1];
    user.dayStreak = (last && daysBetween(last, t) === 1) ? (user.dayStreak || 0) + 1 : 1;
    user.days.push(t);
    if (user.days.length > 400) user.days = user.days.slice(-400);
  }

  $('btn-logout').addEventListener('click', function () {
    save();
    user = null;
    $('name-input').value = '';
    renderKnownUsers();
    show('screen-login');
  });

  /* ============================================================
     HOME
     ============================================================ */
  function renderHome() {
    $('home-name').textContent = user.name;
    $('home-avatar').textContent = user.name.charAt(0).toUpperCase();

    var lv = levelOf(user.xp);
    $('level-title').textContent = lv.title;
    $('level-num').textContent = 'Level ' + lv.num;
    $('xp-total').textContent = user.xp.toLocaleString() + ' XP';
    if (lv.ceil == null) {
      $('xp-fill').style.width = '100%';
      $('level-next').textContent = 'Highest level reached. Ang galing!';
    } else {
      var span = lv.ceil - lv.floor;
      $('xp-fill').style.width = Math.min(100, ((user.xp - lv.floor) / span) * 100) + '%';
      $('level-next').textContent = (lv.ceil - user.xp).toLocaleString() + ' XP to ' + LEVELS[lv.index + 1].title;
    }

    $('day-streak').textContent = user.dayStreak || 0;
    $('day-streak-pill').style.opacity = user.dayStreak > 1 ? '1' : '.5';

    $('stat-answered').textContent = user.answered;
    $('stat-accuracy').textContent = user.answered ? pct(user.correct, user.answered) + '%' : '—';
    $('stat-quizzes').textContent = user.quizzes;
    $('stat-best').textContent = user.bestStreak;

    /* mastery */
    var mw = $('mastery-list');
    mw.innerHTML = '';
    QB.subjects().forEach(function (s) {
      var st = user.subjects[s.name] || { a: 0, c: 0 };
      mw.appendChild(masteryRow(s.name, st.c, st.a, s.count));
    });

    /* badges */
    var bw = $('badges-list');
    bw.innerHTML = '';
    BADGES.forEach(function (b) {
      var earned = user.badges.indexOf(b.id) !== -1;
      var n = el('div', 'badge' + (earned ? ' earned' : ''));
      n.innerHTML = '<div class="badge-ico">' + b.ico + '</div>' +
                    '<div class="badge-name">' + esc(b.name) + '</div>' +
                    '<div class="badge-desc">' + esc(b.desc) + '</div>';
      n.title = b.desc;
      bw.appendChild(n);
    });
    $('badge-count').textContent = user.badges.length + '/' + BADGES.length;

    /* history */
    var hw = $('history-list');
    hw.innerHTML = '';
    if (!user.sessions.length) {
      hw.appendChild(el('div', 'empty', 'No sessions yet. Your results will show up here.'));
    } else {
      user.sessions.slice().reverse().slice(0, 6).forEach(function (h) {
        var row = el('div', 'h-row');
        var cls = h.pct >= 80 ? '' : (h.pct >= 50 ? ' mid' : ' low');
        row.innerHTML =
          '<div class="h-pct' + cls + '">' + h.pct + '%</div>' +
          '<div class="h-main"><div class="h-title">' + esc(h.title) + '</div>' +
          '<div class="h-sub">' + h.correct + '/' + h.total + ' correct · +' + h.xp + ' XP · ' + esc(h.when) + '</div></div>';
        hw.appendChild(row);
      });
    }

    /* leaderboard */
    var lw = $('leaderboard');
    lw.innerHTML = '';
    var ranked = Object.keys(db.users).map(function (k) { return db.users[k]; })
      .filter(function (u) { return u.xp > 0 || u.name === user.name; })
      .sort(function (a, b) { return b.xp - a.xp; }).slice(0, 8);
    if (ranked.length < 2) {
      lw.appendChild(el('div', 'empty', 'Add another name on this device to compare scores.'));
    } else {
      ranked.forEach(function (u, i) {
        var row = el('div', 'lb-row' + (u.name === user.name ? ' me' : ''));
        var medal = ['🥇', '🥈', '🥉'][i] || (i + 1);
        row.innerHTML = '<div class="lb-rank">' + medal + '</div>' +
                        '<div class="lb-name">' + esc(u.name) + '</div>' +
                        '<div class="lb-xp">' + u.xp.toLocaleString() + ' XP</div>';
        lw.appendChild(row);
      });
    }
  }

  function masteryRow(name, c, a, total) {
    var p = pct(c, a);
    var row = el('div', 'm-row');
    var cls = a === 0 ? '' : (p >= 75 ? '' : (p >= 50 ? ' warn' : ' bad'));
    row.innerHTML =
      '<div class="m-head"><div class="m-name">' + esc(name) + '</div>' +
      '<div class="m-val">' + (a ? c + '/' + a + ' · ' + p + '%' : 'not tried yet') +
      (total ? ' <span style="opacity:.6">of ' + total + '</span>' : '') + '</div></div>' +
      '<div class="m-bar"><div class="m-fill' + cls + '" style="width:0%"></div></div>';
    /* animate on next frame */
    requestAnimationFrame(function () {
      var f = row.querySelector('.m-fill');
      if (f) f.style.width = (a ? p : 0) + '%';
    });
    return row;
  }

  $('btn-start').addEventListener('click', function () { openSetup(); });

  /* ============================================================
     SETUP
     ============================================================ */
  function openSetup() {
    if (!setup.subjects.length) setup.subjects = QB.subjects().map(function (s) { return s.name; });
    if (!setup.sources.length) setup.sources = QB.sources().map(function (s) { return s.name; });
    renderSetup();
    show('screen-setup');
  }
  $('setup-back').addEventListener('click', function () { renderHome(); show('screen-home'); });

  function renderSetup() {
    /* mode */
    var modes = $('mode-grid').children;
    for (var i = 0; i < modes.length; i++) {
      modes[i].classList.toggle('active', modes[i].dataset.mode === setup.mode);
    }
    $('panel-subjects').hidden = setup.mode !== 'subjects';
    $('panel-full').hidden = setup.mode !== 'full';

    /* subjects */
    var sl = $('subject-list');
    sl.innerHTML = '';
    QB.subjects().forEach(function (s) {
      var on = setup.subjects.indexOf(s.name) !== -1;
      var sections = s.sets.map(function (x) { return x.section || x.subject; });
      var uniq = sections.filter(function (v, ix, arr) { return arr.indexOf(v) === ix; });
      var sub = uniq.length > 1 ? uniq.length + ' sections' : (s.sets[0].section || '');
      var n = el('div', 'chk' + (on ? ' on' : ''));
      n.innerHTML = '<div class="chk-box">✓</div><div class="chk-main">' +
        '<div class="chk-name">' + esc(s.name) + '</div>' +
        (sub ? '<div class="chk-sub">' + esc(sub) + '</div>' : '') +
        '</div><div class="chk-count">' + s.count + '</div>';
      n.addEventListener('click', function () {
        var ix = setup.subjects.indexOf(s.name);
        if (ix === -1) setup.subjects.push(s.name); else setup.subjects.splice(ix, 1);
        renderSetup();
      });
      sl.appendChild(n);
    });

    /* sources */
    var srl = $('source-list');
    srl.innerHTML = '';
    QB.sources().forEach(function (s) {
      var on = setup.sources.indexOf(s.name) !== -1;
      var n = el('div', 'chk' + (on ? ' on' : ''));
      n.innerHTML = '<div class="chk-box">✓</div><div class="chk-main">' +
        '<div class="chk-name">' + esc(s.name) + '</div>' +
        '<div class="chk-sub">Complete reviewer, in order</div></div>' +
        '<div class="chk-count">' + s.count + '</div>';
      n.addEventListener('click', function () {
        var ix = setup.sources.indexOf(s.name);
        if (ix === -1) setup.sources.push(s.name); else setup.sources.splice(ix, 1);
        renderSetup();
      });
      srl.appendChild(n);
    });

    segSync('count-seg', 'count', String(setup.count));
    segSync('timer-seg', 'timer', String(setup.timer));
    segSync('feedback-seg', 'fb', setup.feedback);

    var pool = buildPool();
    var n = pool.length;
    var mins = setup.timer ? Math.round((setup.timer * n) / 60) : 0;
    $('setup-summary').innerHTML = n
      ? '<b>' + n + ' question' + (n === 1 ? '' : 's') + '</b>' +
        (setup.timer ? ' · <b>' + mins + ' min</b> total time limit' : ' · no time limit') +
        ' · ' + (setup.feedback === 'instant' ? 'answers shown as you go' : 'answers shown at the end')
      : 'Nothing selected yet — pick at least one ' + (setup.mode === 'full' ? 'reviewer' : 'subject') + '.';
    $('btn-begin').disabled = n === 0;
    $('btn-begin').textContent = n ? 'Start · ' + n + ' questions' : 'Start';
  }

  function segSync(segId, attr, val) {
    var kids = $(segId).children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('active', kids[i].dataset[attr] === val);
    }
  }

  Array.prototype.forEach.call($('mode-grid').children, function (b) {
    b.addEventListener('click', function () { setup.mode = b.dataset.mode; renderSetup(); });
  });
  Array.prototype.forEach.call($('count-seg').children, function (b) {
    b.addEventListener('click', function () {
      setup.count = b.dataset.count === 'all' ? 'all' : parseInt(b.dataset.count, 10);
      renderSetup();
    });
  });
  Array.prototype.forEach.call($('timer-seg').children, function (b) {
    b.addEventListener('click', function () { setup.timer = parseInt(b.dataset.timer, 10); renderSetup(); });
  });
  Array.prototype.forEach.call($('feedback-seg').children, function (b) {
    b.addEventListener('click', function () { setup.feedback = b.dataset.fb; renderSetup(); });
  });
  $('subj-all').addEventListener('click', function () {
    setup.subjects = QB.subjects().map(function (s) { return s.name; }); renderSetup();
  });
  $('subj-none').addEventListener('click', function () { setup.subjects = []; renderSetup(); });

  /* Which questions will this session use? */
  function buildPool() {
    var all = QB.all();

    if (setup.mode === 'full') {
      return all.filter(function (q) { return setup.sources.indexOf(q.source) !== -1; });
    }

    var picked = setup.mode === 'quick'
      ? all
      : all.filter(function (q) { return setup.subjects.indexOf(q.subject) !== -1; });

    var want = setup.mode === 'quick' ? 10 : setup.count;
    if (want === 'all' || want >= picked.length) return shuffle(picked.slice());

    /* Prefer questions this student has seen least, then shuffle inside each tier
       so repeat sessions cover new ground instead of the same favourites. */
    var tiers = {};
    picked.forEach(function (q) {
      var k = user && user.seen[q.uid] ? user.seen[q.uid] : 0;
      (tiers[k] = tiers[k] || []).push(q);
    });
    var out = [];
    Object.keys(tiers).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) {
      if (out.length < want) out = out.concat(shuffle(tiers[k]));
    });
    return out.slice(0, want);
  }

  $('btn-begin').addEventListener('click', function () {
    var pool = buildPool();
    if (!pool.length) return;
    startSession(pool);
  });

  /* ============================================================
     QUIZ
     ============================================================ */
  function sessionTitle() {
    if (setup.mode === 'quick') return 'Quick practice';
    if (setup.mode === 'full') {
      return setup.sources.length === QB.sources().length
        ? 'Full exam · both reviewers'
        : 'Full exam · ' + setup.sources[0].replace(/ \(.*/, '');
    }
    var s = setup.subjects;
    if (s.length === QB.subjects().length) return 'All subjects';
    if (s.length <= 2) return s.join(' + ');
    return s.length + ' subjects';
  }

  function startSession(questions) {
    S = {
      qs: questions,
      i: 0,
      answers: new Array(questions.length),   /* chosen index or null */
      times:   new Array(questions.length),
      instant: setup.feedback === 'instant',
      locked: false,
      streak: 0,
      bestStreak: 0,
      startedAt: Date.now(),
      qStartedAt: Date.now(),
      limit: setup.timer ? setup.timer * questions.length : 0,
      timeLeft: setup.timer ? setup.timer * questions.length : 0,
      tick: null,
      title: sessionTitle(),
      explanationsSeen: {}
    };

    $('q-total').textContent = questions.length;
    $('combo').hidden = !S.instant;
    $('timer').hidden = !S.limit;

    if (S.limit) {
      updateTimer();
      S.tick = setInterval(function () {
        S.timeLeft = S.limit - Math.floor((Date.now() - S.startedAt) / 1000);
        updateTimer();
        if (S.timeLeft <= 0) { toast("Time's up!"); finish(); }
      }, 500);
    }
    renderQuestion();
    show('screen-quiz');
  }

  function updateTimer() {
    var t = $('timer');
    t.textContent = mmss(S.timeLeft);
    t.classList.toggle('warn', S.timeLeft <= S.limit * 0.25 && S.timeLeft > 30);
    t.classList.toggle('danger', S.timeLeft <= 30);
  }

  function stopTimer() { if (S && S.tick) { clearInterval(S.tick); S.tick = null; } }

  /* Abstract-reasoning items list their choices as bare letters — show
     "Figure A" instead of repeating the letter next to its own badge. */
  function choiceBody(q, i) {
    var c = q.c[i];
    if (/^[a-eA-E]$/.test(c)) return 'Figure ' + c.toUpperCase();
    return rich(c);
  }

  function renderQuestion() {
    var q = S.qs[S.i];
    S.locked = false;
    S.qStartedAt = Date.now();

    $('q-index').textContent = S.i + 1;
    $('qprog-fill').style.width = ((S.i) / S.qs.length * 100) + '%';
    $('q-subject').textContent = q.section || q.subject;
    $('q-source').textContent = q.source;

    var dir = q.dir || q.setDirections;
    $('q-dir').hidden = !dir;
    if (dir) $('q-dir').innerHTML = rich(dir);

    if (q.passageText) {
      $('q-passage').hidden = false;
      $('q-passage').open = true;
      $('passage-title').textContent = q.passageText.title || 'Read the passage';
      $('passage-body').textContent = q.passageText.text;
      $('passage-credit').textContent = q.passageText.credit || '';
      $('passage-credit').hidden = !q.passageText.credit;
    } else {
      $('q-passage').hidden = true;
    }

    $('q-text').innerHTML = rich(q.q);

    if (q.img) {
      $('q-figure').hidden = false;
      $('q-img').src = q.img;
      $('q-img').alt = 'Figure for question ' + (S.i + 1);
    } else {
      $('q-figure').hidden = true;
      $('q-img').removeAttribute('src');
    }

    var cw = $('choices');
    cw.innerHTML = '';
    q.c.forEach(function (_, i) {
      var b = el('button', 'choice');
      b.type = 'button';
      b.innerHTML = '<span class="choice-key">' + LETTERS[i] + '</span>' +
                    '<span class="choice-body">' + choiceBody(q, i) + '</span>';
      b.addEventListener('click', function () { choose(i); });
      cw.appendChild(b);
    });

    /* restore a previous answer when stepping back through the session */
    var prev = S.answers[S.i];
    if (prev != null) {
      if (S.instant) { paintResult(prev); S.locked = true; }
      else cw.children[prev].classList.add('selected');
    }

    $('feedback').hidden = true;
    $('btn-next').disabled = S.instant ? (prev == null) : false;
    $('btn-next').textContent = S.i === S.qs.length - 1 ? 'Finish' : 'Next';
    $('btn-skip').hidden = S.instant && prev != null;
    $('quiz-scroll').scrollTop = 0;
    updateCombo(false);
  }

  function choose(i) {
    if (S.locked) return;
    var q = S.qs[S.i];
    S.answers[S.i] = i;
    S.times[S.i] = Date.now() - S.qStartedAt;

    if (!S.instant) {
      var kids = $('choices').children;
      for (var k = 0; k < kids.length; k++) kids[k].classList.toggle('selected', k === i);
      $('btn-next').disabled = false;
      return;
    }

    S.locked = true;
    var right = i === q.a;
    S.streak = right ? S.streak + 1 : 0;
    if (S.streak > S.bestStreak) S.bestStreak = S.streak;
    updateCombo(right && S.streak > 1);

    paintResult(i);
    $('btn-next').disabled = false;
    $('btn-skip').hidden = true;

    var fb = $('feedback');
    setTimeout(function () {
      fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }

  function paintResult(chosen) {
    var q = S.qs[S.i];
    var kids = $('choices').children;
    for (var k = 0; k < kids.length; k++) {
      kids[k].disabled = true;
      if (k === q.a) {
        kids[k].classList.add('correct');
        kids[k].insertAdjacentHTML('beforeend', '<span class="choice-mark">✓</span>');
      } else if (k === chosen) {
        kids[k].classList.add('wrong');
        kids[k].insertAdjacentHTML('beforeend', '<span class="choice-mark">✕</span>');
      }
    }
    var right = chosen === q.a;
    var fb = $('feedback');
    fb.className = 'feedback ' + (right ? 'ok' : 'bad');
    fb.hidden = false;
    fb.innerHTML =
      '<div class="fb-head">' + (right ? '✅ Tama! ' : '❌ Not quite — the answer is ' + LETTERS[q.a] + '.') + '</div>' +
      '<div class="fb-why">' + rich(q.e) + '</div>' +
      (q.note ? '<div class="fb-note">' + rich(q.note) + '</div>' : '');
    if (!S.explanationsSeen[q.uid]) { S.explanationsSeen[q.uid] = 1; }
  }

  function updateCombo(pop) {
    if (!S.instant) return;
    var c = $('combo');
    c.hidden = S.streak < 2;
    $('combo-n').textContent = S.streak;
    if (pop) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
  }

  $('btn-next').addEventListener('click', function () {
    if (S.i === S.qs.length - 1) { finish(); return; }
    S.i++; renderQuestion();
  });
  $('btn-skip').addEventListener('click', function () {
    S.answers[S.i] = null;
    S.times[S.i] = Date.now() - S.qStartedAt;
    if (S.instant) { S.streak = 0; updateCombo(false); }
    if (S.i === S.qs.length - 1) { finish(); return; }
    S.i++; renderQuestion();
  });
  $('quiz-quit').addEventListener('click', function () {
    if (!confirm('Quit this session? Your progress in it will not be saved.')) return;
    stopTimer(); S = null; renderHome(); show('screen-home');
  });

  /* ============================================================
     SCORING
     ============================================================ */
  function finish() {
    if (!S || S.done) return;      /* guard: timer expiry and a Finish tap can race */
    S.done = true;
    stopTimer();

    var q, i, correct = 0, streak = 0, best = 0, xp = 0, answered = 0;
    var perSubject = {};
    var elapsed = Math.round((Date.now() - S.startedAt) / 1000);

    for (i = 0; i < S.qs.length; i++) {
      q = S.qs[i];
      var chosen = S.answers[i];
      var right = chosen != null && chosen === q.a;
      if (chosen != null) answered++;
      if (right) {
        correct++; streak++;
        if (streak > best) best = streak;
        xp += 10;
        if (streak >= 5) xp += 10; else if (streak >= 3) xp += 5;
        if (S.times[i] != null && S.times[i] < 10000) xp += 3;
      } else {
        streak = 0;
      }
      var sub = perSubject[q.subject] || (perSubject[q.subject] = { a: 0, c: 0 });
      sub.a++; if (right) sub.c++;
      user.seen[q.uid] = (user.seen[q.uid] || 0) + 1;
    }

    var p = pct(correct, S.qs.length);
    xp += 20;                                              /* completion */
    if (p === 100 && S.qs.length >= 10) xp += 50;          /* flawless   */

    /* profile totals */
    user.xp += xp;
    user.answered += S.qs.length;
    user.correct += correct;
    user.quizzes += 1;
    if (best > user.bestStreak) user.bestStreak = best;
    user.explanationsRead += Object.keys(S.explanationsSeen).length;
    Object.keys(perSubject).forEach(function (k) {
      var t = user.subjects[k] || (user.subjects[k] = { a: 0, c: 0 });
      t.a += perSubject[k].a; t.c += perSubject[k].c;
    });
    /* Full record of this session — every question, what was chosen, how long it took.
       This is what the Records screen and the CSV exports read from. */
    var now = new Date();
    user.sessions.push({
      at: now.toISOString(),
      when: now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      title: S.title, mode: setup.mode,
      correct: correct, total: S.qs.length, pct: p, xp: xp,
      elapsed: elapsed, bestStreak: best,
      timer: setup.timer || 0, feedback: S.instant ? 'practice' : 'exam',
      items: S.qs.map(function (q, ix) {
        return {
          uid: q.uid,
          chosen: S.answers[ix] == null ? null : S.answers[ix],
          ms: S.times[ix] == null ? null : S.times[ix]
        };
      })
    });
    if (user.sessions.length > 60) user.sessions = user.sessions.slice(-60);

    /* badges */
    var earned = [];
    function grant(id) {
      if (user.badges.indexOf(id) === -1) {
        user.badges.push(id);
        earned.push(BADGES.filter(function (b) { return b.id === id; })[0]);
      }
    }
    var avgSec = S.qs.length ? elapsed / S.qs.length : 0;
    grant('first');
    if (best >= 10) grant('streak10');
    if (p === 100 && S.qs.length >= 10) grant('perfect');
    if (S.qs.length >= 50) grant('marathon');
    if (Object.keys(user.subjects).length >= QB.subjects().length) grant('rounded');
    if (user.answered >= 100) grant('century');
    if (avgSec < 15 && p >= 80 && S.qs.length >= 10) grant('speed');
    if (S.limit && S.timeLeft > 0 && answered === S.qs.length) grant('clock');
    if (user.explanationsRead >= 25) grant('bookworm');
    if ((user.dayStreak || 0) >= 3) grant('daily');

    save();
    renderResults({ correct: correct, total: S.qs.length, pct: p, xp: xp, best: best,
                    elapsed: elapsed, perSubject: perSubject, earned: earned });
    show('screen-results');
  }

  function renderResults(r) {
    var mood = r.pct >= 90 ? ['🏆', 'Outstanding!']
             : r.pct >= 75 ? ['🎉', 'Great work!']
             : r.pct >= 50 ? ['👍', 'Good effort!']
             : ['💪', 'Keep going!'];
    $('result-emoji').textContent = mood[0];
    $('result-headline').textContent = mood[1];
    $('result-pct').textContent = r.pct;
    $('result-score').textContent = r.correct + ' of ' + r.total + ' correct';

    var C = 2 * Math.PI * 52;
    var ring = $('ring-fg');
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ring.style.strokeDashoffset = C * (1 - r.pct / 100);
      });
    });

    $('xp-earned').innerHTML = '⭐ You earned <b>+' + r.xp + ' XP</b> · now Level ' +
      levelOf(user.xp).num + ' · ' + esc(levelOf(user.xp).title);

    var nb = $('new-badges');
    nb.innerHTML = '';
    r.earned.forEach(function (b, i) {
      var n = el('div', 'nb');
      n.style.animationDelay = (i * 0.12) + 's';
      n.innerHTML = '<div class="nb-ico">' + b.ico + '</div><div><div class="nb-t">New badge · ' +
        esc(b.name) + '</div><div class="nb-d">' + esc(b.desc) + '</div></div>';
      nb.appendChild(n);
    });

    $('res-streak').textContent = r.best;
    $('res-time').textContent = mmss(r.elapsed);
    $('res-avg').textContent = r.total ? Math.round(r.elapsed / r.total) + 's' : '—';

    var bw = $('result-breakdown');
    bw.innerHTML = '';
    Object.keys(r.perSubject).forEach(function (k) {
      bw.appendChild(masteryRow(k, r.perSubject[k].c, r.perSubject[k].a, 0));
    });

    if (r.pct >= 75) confetti();
  }

  $('btn-again').addEventListener('click', function () { openSetup(); });
  $('btn-home').addEventListener('click', function () { renderHome(); show('screen-home'); });
  $('btn-review-home').addEventListener('click', function () { renderHome(); show('screen-home'); });
  $('review-back').addEventListener('click', function () { show('screen-results'); });
  $('btn-review').addEventListener('click', function () {
    reviewOnlyMissed = false;
    renderReview(); show('screen-review');
  });
  $('review-filter').addEventListener('click', function () {
    reviewOnlyMissed = !reviewOnlyMissed;
    $('review-filter').classList.toggle('on', reviewOnlyMissed);
    renderReview();
  });

  /* ============================================================
     REVIEW
     ============================================================ */
  function renderReview() {
    var wrap = $('review-list');
    wrap.innerHTML = '';
    var missed = 0;
    S.qs.forEach(function (q, i) { if (S.answers[i] !== q.a) missed++; });

    $('review-note').innerHTML = reviewOnlyMissed
      ? 'Showing the <b>' + missed + '</b> question' + (missed === 1 ? '' : 's') + ' you missed. Tap ⚑ to see everything.'
      : 'Every question with the correct answer and a short explanation. Tap ⚑ to show only the <b>' + missed + '</b> you missed.';

    var shown = 0;
    S.qs.forEach(function (q, i) {
      var chosen = S.answers[i];
      var right = chosen === q.a;
      if (reviewOnlyMissed && right) return;
      shown++;

      var card = el('div', 'rv ' + (right ? 'hit' : 'miss'));
      var head = '<div class="rv-head"><span class="rv-n">Q' + (i + 1) + '</span>' +
                 '<span>' + esc(q.section || q.subject) + '</span>' +
                 '<span style="margin-left:auto">' + (right ? '✅' : '❌') + '</span></div>';
      var dir = q.dir || q.setDirections;
      var body = (dir ? '<div class="q-dir">' + rich(dir) + '</div>' : '') +
                 '<div class="rv-q">' + rich(q.q) + '</div>' +
                 (q.img ? '<div class="rv-fig"><img src="' + esc(q.img) + '" alt="Figure for question ' + (i + 1) + '"></div>' : '');

      var lines = '<div class="rv-ans">';
      if (chosen == null) {
        lines += '<div class="rv-line you-wrong"><b>You:</b><span>skipped</span></div>';
      } else if (!right) {
        lines += '<div class="rv-line you-wrong"><b>You:</b><span>' + LETTERS[chosen] + '. ' + choiceBody(q, chosen) + '</span></div>';
      }
      lines += '<div class="rv-line ok"><b>Answer:</b><span>' + LETTERS[q.a] + '. ' + choiceBody(q, q.a) + '</span></div></div>';

      var why = '<div class="rv-why">' + rich(q.e) + '</div>' +
                (q.note ? '<div class="rv-note">' + rich(q.note) + '</div>' : '');

      card.innerHTML = head + body + lines + why;
      wrap.appendChild(card);
    });

    if (!shown) {
      wrap.appendChild(el('div', 'empty', 'Wala kang mali — you got every question right. 🎉'));
    }
    $('screen-review').querySelector('.scroll').scrollTop = 0;
  }

  /* ============================================================
     RECORDS & EXPORT
     Everything saved on this device, per student, per session, per answer.
     ============================================================ */
  var recordsFilter = 'all';          /* 'all' or a lower-cased student key */
  var recordsFromLogin = false;       /* where "back" should go */

  function openRecords(fromLogin) {
    recordsFromLogin = !!fromLogin;
    /* signed in: start on that student; from the login screen: start on everyone */
    recordsFilter = user ? user.name.toLowerCase() : 'all';
    renderRecords();
    show('screen-records');
  }
  $('btn-records').addEventListener('click', function () { openRecords(false); });
  $('login-records').addEventListener('click', function () { openRecords(true); });
  $('records-back').addEventListener('click', function () {
    if (recordsFromLogin || !user) { renderKnownUsers(); show('screen-login'); }
    else { renderHome(); show('screen-home'); }
  });

  /* [{user, session}] newest first, honouring the student filter */
  function selectedSessions() {
    var rows = [];
    allUsers().forEach(function (u) {
      if (recordsFilter !== 'all' && u.name.toLowerCase() !== recordsFilter) return;
      u.sessions.forEach(function (s) { rows.push({ user: u, session: s }); });
    });
    rows.sort(function (a, b) { return (b.session.at || '') > (a.session.at || '') ? 1 : -1; });
    return rows;
  }

  function fmtDate(s) {
    if (!s.at) return s.when || '';
    var d = new Date(s.at);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
           ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function renderRecords() {
    var users = allUsers().filter(function (u) { return u.sessions.length; });
    if (recordsFilter !== 'all' && !users.some(function (u) { return u.name.toLowerCase() === recordsFilter; })) {
      recordsFilter = 'all';
    }

    /* student chips */
    var cw = $('records-students');
    cw.innerHTML = '';
    var allChip = el('button', 'chip' + (recordsFilter === 'all' ? ' on' : ''),
      'Everyone <small>' + users.reduce(function (n, u) { return n + u.sessions.length; }, 0) + '</small>');
    allChip.type = 'button';
    allChip.addEventListener('click', function () { recordsFilter = 'all'; renderRecords(); });
    cw.appendChild(allChip);
    users.sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (u) {
      var k = u.name.toLowerCase();
      var c = el('button', 'chip' + (recordsFilter === k ? ' on' : ''),
        esc(u.name) + ' <small>' + u.sessions.length + '</small>');
      c.type = 'button';
      c.addEventListener('click', function () { recordsFilter = k; renderRecords(); });
      cw.appendChild(c);
    });

    var rows = selectedSessions();
    $('records-count').textContent = rows.length;
    var who = recordsFilter === 'all' ? 'all students on this device' : rows.length && rows[0].user.name;
    $('export-hint').textContent = rows.length
      ? 'Exports cover ' + who + ' — ' + rows.length + ' session' + (rows.length === 1 ? '' : 's') +
        ', ' + rows.reduce(function (n, r) { return n + r.session.items.length; }, 0) + ' answers. Opens in Excel or Google Sheets.'
      : 'Nothing to export yet.';
    $('export-sessions').disabled = !rows.length;
    $('export-answers').disabled = !rows.length;

    var lw = $('records-list');
    lw.innerHTML = '';
    if (!rows.length) {
      lw.appendChild(el('div', 'empty', 'No sessions recorded on this device yet.'));
      return;
    }
    rows.forEach(function (r) { lw.appendChild(sessionCard(r.user, r.session)); });
  }

  function sessionCard(u, s) {
    var d = el('details', 'rec');
    var cls = s.pct >= 80 ? '' : (s.pct >= 50 ? ' mid' : ' low');
    var sub = [fmtDate(s), s.correct + '/' + s.total + ' correct', '+' + s.xp + ' XP'];
    if (recordsFilter === 'all') sub.unshift(u.name);
    d.innerHTML =
      '<summary>' +
        '<div class="rec-pct' + cls + '">' + s.pct + '%</div>' +
        '<div class="rec-main"><div class="rec-title">' + esc(s.title) + '</div>' +
        '<div class="rec-sub">' + esc(sub.join(' · ')) + '</div></div>' +
        '<div class="rec-caret">▾</div>' +
      '</summary>';

    var body = el('div', 'rec-body');
    var meta = [];
    if (s.feedback) meta.push(s.feedback === 'practice' ? 'Practice mode (answers shown as you go)' : 'Exam mode (answers shown at the end)');
    if (s.timer) meta.push('Time limit ' + s.timer + 's per item');
    if (s.elapsed != null) meta.push('Took ' + mmss(s.elapsed) + (s.total ? ' (' + Math.round(s.elapsed / s.total) + 's per item)' : ''));
    if (s.bestStreak != null) meta.push('Best streak ' + s.bestStreak);
    body.appendChild(el('div', 'rec-meta', esc(meta.join(' · '))));

    if (!s.items.length) {
      body.appendChild(el('div', 'rec-empty', 'This session was saved by an earlier version of the app, so only the score is available.'));
    } else {
      s.items.forEach(function (it, i) {
        var q = QB.byUid(it.uid);
        if (!q) return;
        var right = it.chosen === q.a;
        var row = el('div', 'ri');
        var yours = it.chosen == null
          ? '<span class="you-wrong">skipped</span>'
          : '<span class="' + (right ? 'you-right' : 'you-wrong') + '">' + LETTERS[it.chosen] + '. ' + choiceBody(q, it.chosen) + '</span>';
        row.innerHTML =
          '<div class="ri-n">' + (i + 1) + '</div>' +
          '<div class="ri-q"><div class="ri-sec">' + esc(q.section || q.subject) + ' · #' + q.n + '</div>' +
            rich(q.q.length > 140 ? q.q.slice(0, 140) + '…' : q.q) +
            '<div class="ri-ans"><b>You:</b> ' + yours + (right ? '' : ' &nbsp; <b>Answer:</b> ' + LETTERS[q.a] + '. ' + choiceBody(q, q.a)) + '</div>' +
          '</div>' +
          '<div class="ri-mark">' + (right ? '✅' : (it.chosen == null ? '⏭️' : '❌')) +
            (it.ms != null ? '<small>' + Math.round(it.ms / 1000) + 's</small>' : '') + '</div>';
        body.appendChild(row);
      });
    }
    d.appendChild(body);
    return d;
  }

  /* ---- CSV ---- */
  function csvCell(v) {
    if (v == null) return '';
    var s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(rows) {
    /* BOM so Excel reads ₱, é and friends as UTF-8 */
    return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }
  function isoDate(s) { return s.at ? s.at.slice(0, 10) : ''; }
  function isoTime(s) { return s.at ? new Date(s.at).toTimeString().slice(0, 5) : ''; }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportName(kind) {
    var who = recordsFilter === 'all' ? 'all-students' : recordsFilter.replace(/[^a-z0-9]+/g, '-');
    return 'pisay-reviewer-' + kind + '-' + who + '-' + today() + '.csv';
  }

  $('export-sessions').addEventListener('click', function () {
    var rows = [['student', 'date', 'time', 'session', 'mode', 'questions', 'correct', 'score_pct',
                 'xp', 'time_used_sec', 'sec_per_item', 'best_streak', 'time_limit_per_item_sec', 'feedback']];
    selectedSessions().forEach(function (r) {
      var s = r.session;
      rows.push([r.user.name, isoDate(s), isoTime(s), s.title, s.mode || '', s.total, s.correct, s.pct,
                 s.xp, s.elapsed, (s.elapsed != null && s.total) ? Math.round(s.elapsed / s.total) : '',
                 s.bestStreak, s.timer || 0, s.feedback || '']);
    });
    download(exportName('sessions'), csv(rows));
    toast('Sessions CSV downloaded');
  });

  $('export-answers').addEventListener('click', function () {
    var rows = [['student', 'date', 'time', 'session', 'q_no', 'source', 'subject', 'section', 'item_no',
                 'question', 'your_answer', 'your_answer_text', 'correct_answer', 'correct_answer_text',
                 'result', 'seconds']];
    selectedSessions().forEach(function (r) {
      var s = r.session;
      s.items.forEach(function (it, i) {
        var q = QB.byUid(it.uid);
        if (!q) return;
        var right = it.chosen === q.a;
        rows.push([r.user.name, isoDate(s), isoTime(s), s.title, i + 1, q.source, q.subject, q.section || '',
                   q.n, q.q.replace(/\*/g, ''),
                   it.chosen == null ? '' : LETTERS[it.chosen],
                   it.chosen == null ? '' : q.c[it.chosen],
                   LETTERS[q.a], q.c[q.a],
                   it.chosen == null ? 'skipped' : (right ? 'correct' : 'wrong'),
                   it.ms != null ? Math.round(it.ms / 1000) : '']);
      });
    });
    download(exportName('answers'), csv(rows));
    toast('Answers CSV downloaded');
  });

  /* ============================================================
     CONFETTI
     ============================================================ */
  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cv = $('confetti'), ctx = cv.getContext('2d');
    var W = cv.width = window.innerWidth, H = cv.height = window.innerHeight;
    var colors = ['#10714a', '#e0930b', '#3ec98a', '#f4b740', '#4c9be8', '#e86a6a'];
    var bits = [];
    for (var i = 0; i < 120; i++) {
      bits.push({
        x: Math.random() * W, y: -20 - Math.random() * H * 0.4,
        w: 6 + Math.random() * 7, h: 8 + Math.random() * 9,
        vy: 2 + Math.random() * 3.4, vx: -1.4 + Math.random() * 2.8,
        rot: Math.random() * Math.PI, vr: -0.14 + Math.random() * 0.28,
        c: colors[(Math.random() * colors.length) | 0]
      });
    }
    cv.classList.add('on');
    var t0 = Date.now();
    (function frame() {
      var age = Date.now() - t0;
      ctx.clearRect(0, 0, W, H);
      bits.forEach(function (b) {
        b.x += b.vx; b.y += b.vy; b.rot += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.globalAlpha = age > 2600 ? Math.max(0, 1 - (age - 2600) / 700) : 1;
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      });
      if (age < 3300) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); cv.classList.remove('on'); }
    })();
  }

  /* ============================================================
     KEYBOARD
     ============================================================ */
  document.addEventListener('keydown', function (e) {
    if (!$('screen-quiz').classList.contains('active') || !S) return;
    var k = e.key.toUpperCase();
    var ix = LETTERS.indexOf(k);
    if (ix > -1 && ix < S.qs[S.i].c.length) { choose(ix); e.preventDefault(); return; }
    if (/^[1-6]$/.test(e.key)) {
      var n = parseInt(e.key, 10) - 1;
      if (n < S.qs[S.i].c.length) { choose(n); e.preventDefault(); }
      return;
    }
    if (e.key === 'Enter' && !$('btn-next').disabled) { $('btn-next').click(); e.preventDefault(); }
  });

  /* ============================================================
     BOOT
     ============================================================ */
  load();
  applyTheme();
  renderKnownUsers();
  if (db.lastUser && db.users[db.lastUser.toLowerCase()]) {
    $('name-input').value = db.lastUser;
  }
  window.addEventListener('beforeunload', function () { if (user) save(); });
})();
