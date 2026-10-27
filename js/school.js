(function () {
  "use strict";
  var J = window.Jinzai;
  var KEY = "jinzai-school-v1";
  var opening = J.workMonth();
  var state = J.loadStore(KEY, null) || {
    profile: { schoolName: "", schoolKind: "elementary", principal: "", roster: [] },
    documents: [],
    tab: "docs",
    role: "teacher"
  };
  if (!state.role) state.role = "teacher";
  var filter = {
    year: opening.year,
    month: opening.month,
    type: "all"
  };
  var draft = null;
  var formMessage = null;
  var reviewMode = "list";
  var pickedSubmit = {};
  var submitPreview = null;
  var previewNote = "";

  function applyKnownSchool() {
    if (J.plainSchoolName(state.profile.schoolName) === "寺方南小学校") {
      state.profile.schoolName = "寺方小学校";
      state.profile.schoolKind = "elementary";
      state.profile.schoolCode = "";
    }
    if (J.schoolCodeOf({ code: state.profile.schoolCode })) return;
    var known = J.knownSchool(state.profile.schoolName);
    if (!known) return;
    state.profile.schoolName = known.name;
    if (!state.profile.schoolKind) state.profile.schoolKind = known.kind;
    if (J.schoolCodeOf(known)) state.profile.schoolCode = known.code;
  }

  function save() {
    var ok = J.saveStore(KEY, {
      profile: state.profile,
      documents: state.documents,
      tab: state.tab,
      role: state.role
    });
    if (!ok) alert("このパソコンの画面には保存できませんでした。右上のボタンでファイルに残してください。");
    return ok;
  }

  function noticeHtml(message) {
    if (!message) return "";
    return '<div class="alert ' + (message.type === "ok" ? "ok" : "bad") + '" role="status">' +
      J.esc(message.text).replace(/\n/g, "<br>") + "</div>";
  }

  function caption() {
    var code = J.schoolCodeOf({ code: state.profile.schoolCode });
    var name = state.profile.schoolName
      ? "守口市立" + state.profile.schoolName + (code ? "（" + code + "）" : "")
      : "学校園が未設定です";
    document.getElementById("school-caption").textContent = name;
  }

  function setTab(tab) {
    if (draft) readForm();
    state.tab = tab;
    save();
    render();
  }

  function tabsForRole() {
    if (state.role === "manager") return [["export", "〆切・確認"], ["talent", "人材を探す"], ["profile", "学校の設定"]];
    return [["docs", "計画・報告"], ["calendar", "自分のカレンダー"], ["profile", "学校の設定"]];
  }

  function renderRole() {
    var manager = state.role === "manager";
    document.body.classList.toggle("role-manager", manager);
    document.getElementById("role-bar").innerHTML =
      '<div class="role-switch">' +
      '<button type="button" class="role teacher' + (manager ? "" : " active") + '" data-action="role" data-role="teacher">担当の先生</button>' +
      '<button type="button" class="role manager' + (manager ? " active" : "") + '" data-action="role" data-role="manager">管理職</button></div>';
    var note = document.getElementById("role-note");
    note.className = "role-note" + (manager ? " manager" : " teacher");
    note.textContent = manager
      ? "担当から届いたファイルを学校のフォルダに集め、〆切と内容を確認します。問題がなければ、その学校フォルダを教育センターの毎月のフォルダへ入れます。"
      : "作業の全体は右上で保存し、続きはそのファイルを開きます。管理職へ渡すときは、「帳票確認」で帳票を開いてから書き出します。";
  }

  function render() {
    caption();
    var allowed = tabsForRole();
    if (!allowed.some(function (t) { return t[0] === state.tab; })) state.tab = allowed[0][0];
    renderRole();
    var tabs = allowed;
    document.getElementById("tabs").innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (state.tab === t[0] ? " active" : "") + '" data-action="tab" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
    document.body.classList.toggle("has-preview", !!(submitPreview && submitPreview.length));
    var message = formMessage;
    formMessage = null;
    var app = document.getElementById("app");
    if (state.tab === "docs") app.innerHTML = viewDocs(message);
    else if (state.tab === "calendar") app.innerHTML = viewCalendar();
    else if (state.tab === "export") app.innerHTML = viewExport(message);
    else if (state.tab === "talent") app.innerHTML = viewTalent();
    else app.innerHTML = viewProfile();
    var notice = document.querySelector(".alert[role='status']");
    if (notice) notice.scrollIntoView({ block: "nearest" });
  }

  function monthDocsOf(type) {
    return state.documents.filter(function (d) {
      return Number(d.year) === Number(filter.year) && Number(d.month) === Number(filter.month) && d.type === type;
    }).sort(function (a, b) {
      return (a.instructorName || "").localeCompare(b.instructorName || "", "ja");
    });
  }

  function docButton(d) {
    var current = draft && draft.id === d.id ? draft : d;
    var cat = J.categoryOf(current.category);
    var amount = cat.unit === "count" ? J.documentCount(current) + "回" : J.formatMinutes(J.documentMinutes(current));
    var active = draft && draft.id === d.id;
    var nameBtn = '<button type="button" class="list-btn' + (active ? " active" : "") + '" data-action="edit" data-id="' + J.esc(d.id) + '">' +
      "<strong" + (active ? ' id="person-label"' : "") + ">" + J.esc(current.instructorName || "（氏名未入力）") + "</strong>" +
      "<span>" + J.esc(current.title || "（活動名未入力）") + " / " + amount + (current.wip ? " / 下書き" : "") + "</span>" +
      "</button>";
    return '<div class="person-row"><label class="person-check"><input type="checkbox" data-submit-pick="' + J.esc(d.id) + '"' +
      (pickedSubmit[d.id] ? " checked" : "") + '></label>' + nameBtn +
      '<button type="button" class="btn btn-primary person-submit" data-action="submit-person" data-id="' + J.esc(d.id) + '">帳票確認</button></div>';
  }

  function submitModeBar() {
    return '<p class="small submit-note">一人の帳票は名前の横の「帳票確認」で開きます。</p>';
  }

  function bundleBar() {
    return '<div class="bundle-bar">' +
      '<button type="button" class="btn" data-action="submit-all">表示中をすべて選ぶ</button> ' +
      '<button type="button" class="btn" data-action="submit-none">すべて解除</button> ' +
      '<button type="button" class="btn btn-primary" data-action="submit-bundle">チェックした帳票を確認</button></div>';
  }

  function sideGroup(type, title, due) {
    var items = monthDocsOf(type).slice();
    if (draft && draft.type === type && Number(draft.year) === Number(filter.year) && Number(draft.month) === Number(filter.month) && !items.some(function (d) { return d.id === draft.id; })) items.unshift(draft);
    var rows = items.map(docButton).join("") || '<p class="muted">まだありません</p>';
    return '<section class="side-group ' + type + '"><div class="side-head"><h3>' + title + "</h3>" +
      '<button type="button" class="btn" data-action="new" data-type="' + type + '">新規作成</button></div>' +
      '<p class="small">提出めど ' + J.esc(due) + "</p>" + rows + "</section>";
  }

  function viewDocs(message) {
    var duePlan = J.warekiFromISO(J.planDueISO(filter.year, filter.month));
    var dueReport = J.warekiFromISO(J.reportDueISO(filter.year, filter.month));
    var formNote = message && message.place === "list" ? null : message;
    var listNote = message && message.place === "list" ? message : null;
    return '<div class="grid-2 compact-side"><section class="panel side-panel">' +
      '<div class="start-box"><strong>ファイルを開く</strong>' +
      '<p class="small">置き換えて開くと、いまの計画・報告はファイルの内容になります。追加して開くと、ファイルの計画・報告がいまの一覧に足されます。同じ書類があるときは、ファイルの内容になります。</p>' +
      '<label class="field">置き換えて開く<input id="work-file" type="file" accept=".xlsx,.xls,application/json,.json"></label>' +
      '<label class="field">追加して開く<input id="work-file-add" type="file" accept=".xlsx,.xls,application/json,.json"></label></div>' +
      noticeHtml(listNote) +
      submitModeBar() +
      '<div class="toolbar side-tools">' + monthFields() +
      '<button type="button" class="btn" data-action="next-month-plans">次の月の計画を作成</button></div>' +
      sideGroup("plan", "活用計画", duePlan) +
      sideGroup("report", "実績報告", dueReport) +
      bundleBar() +
      '</section><div class="editor-col"><section class="panel">' + (submitPreview && submitPreview.length ? previewHtml() : (draft ? formHtml(formNote) : noticeHtml(formNote) + '<p class="lead">左の活用計画、またはその下の実績報告から開くか、「新規作成」で新しく作ってください。</p>')) +
      "</section></div></div>";
  }

  function monthFields() {
    return '<label class="field year-field">年<input name="filterYear" type="number" min="2019" max="2100" value="' + filter.year + '"></label>' +
      '<label class="field month-field">月<input name="filterMonth" type="number" min="1" max="12" value="' + filter.month + '"></label>';
  }

  function option(value, label, current) {
    return '<option value="' + J.esc(value) + '"' + (String(current) === String(value) ? " selected" : "") + ">" + J.esc(label) + "</option>";
  }

  function formHtml(message) {
    var d = draft;
    var cat = J.categoryOf(d.category);
    var rows = (d.sessions.length ? d.sessions : [J.blankSession()]).map(function (s, i) {
      var mins = J.sessionMinutes(s);
      var minsText = mins == null || mins < 0 ? "—" : J.formatMinutes(mins);
      return '<div class="session" data-session="' + i + '">' +
        '<label class="field">日<input name="date-' + i + '" type="date" value="' + J.esc(s.date) + '"></label>' +
        '<div class="wd" data-wd="' + i + '">' + J.esc(s.date ? J.weekday(s.date) : "曜") + "</div>" +
        '<label class="field">開始<input name="start-' + i + '" type="time" value="' + J.esc(s.start) + '"></label>' +
        '<label class="field">終了<input name="end-' + i + '" type="time" value="' + J.esc(s.end) + '"></label>' +
        '<label class="field break-field">休憩<input name="break-' + i + '" type="number" min="0" step="5" value="' + J.esc(s.breakMinutes || 0) + '" title="休憩（分）"></label>' +
        '<div class="mins"><span>活動</span><strong data-mins="' + i + '">' + minsText + "</strong></div>" +
        '<label class="field session-content">その回の内容<input name="content-' + i + '" value="' + J.esc(s.content || "") + '"></label>' +
        '<button type="button" class="btn btn-ghost" data-action="remove-session" data-index="' + i + '">削除</button></div>';
    }).join("");
    var total = J.documentMinutes(d);
    var count = J.documentCount(d);
    return '<form id="doc-form" class="doc-form"><h2>' + (d.type === "plan" ? "活用計画" : "実績報告") +
      '<span class="doc-who" id="doc-who">' + J.esc(d.instructorName || "") + "</span></h2>" +
      noticeHtml(message) +
      '<div class="who">' +
      '<label class="field who-id">登録番号<input name="instructorId" maxlength="4" inputmode="numeric" value="' + J.esc(d.instructorId) + '" placeholder="1001"></label>' +
      '<label class="field who-name">指導者氏名<input name="instructorName" value="' + J.esc(d.instructorName) + '"></label>' +
      '<label class="field who-kana">ふりがな<input name="instructorKana" value="' + J.esc(d.instructorKana) + '"></label>' +
      "</div>" +
      '<div class="doc-head">' +
      '<label class="field wide">活動区分<select name="category">' + J.CATEGORIES.map(function (c) {
        return option(c.id, c.form + "　" + c.label, d.category);
      }).join("") + "</select></label>" +
      '<label class="field">作成日<input name="preparedOn" type="date" value="' + J.esc(d.preparedOn || J.todayISO()) + '"></label>' +
      '<label class="field">対象年月<span class="ym"><input name="year" type="number" min="2019" max="2100" value="' + J.esc(d.year) + '">' +
      '<input name="month" type="number" min="1" max="12" value="' + J.esc(d.month) + '"></span></label>' +
      '<label class="field wide">' + J.esc(cat.fieldLabel) + '<input name="title" value="' + J.esc(d.title) + '"></label>' +
      (cat.hasGrade ? '<label class="field">対象学年<input name="grade" value="' + J.esc(d.grade || "") + '" placeholder="例 3年"></label>' +
        '<label class="field">参加人数<input name="participants" type="number" min="0" value="' + J.esc(d.participants) + '"></label>' : "") +
      (d.category === "university"
        ? '<label class="field wide">大学名<input name="university" value="' + J.esc(d.university || "") + '"></label>'
        : '<label class="field wide">校園長名<input name="principal" value="' + J.esc(d.principal || state.profile.principal || "") + '"></label>') +
      '<label class="field full">活動内容の概要<textarea class="summary" name="summary" rows="1">' + J.esc(d.summary || "") + "</textarea></label>" +
      "</div>" +
      '<h3>活動の明細</h3>' +
      '<p class="small">活動時間は「終了 − 開始 − 休憩」です。休憩を報酬に含めるときは0にしてください。労働時間が6時間を超える日は休憩45分以上、8時間を超える日は60分以上にしてください。大学連携は1行を1回として数えます。</p>' +
      '<div class="sessions">' + rows + "</div>" +
      breakPromptHtml(d) +
      '<p><strong id="total-label">合計 ' + (cat.unit === "count" ? count + "回" : J.formatMinutes(total)) + "</strong></p>" +
      '<div class="toolbar session-actions"><button type="button" class="btn" data-action="add-session">行を追加</button>' +
      '<button type="button" class="btn btn-primary" data-action="save-doc">保存</button>' +
      '<button type="button" class="btn" data-action="cancel-doc">閉じる</button>' +
      (d.type === "plan" ? '<button type="button" class="btn" data-action="copy-report">この計画から実績報告を作る</button>' : "") +
      (state.documents.some(function (x) { return x.id === d.id; }) ? '<button type="button" class="btn btn-danger" data-action="delete-doc">この書類を削除</button>' : "") +
      "</div></form>";
  }

  function readForm() {
    var form = document.getElementById("doc-form");
    if (!form || !draft) return;
    var fd = new FormData(form);
    draft.category = fd.get("category");
    draft.preparedOn = fd.get("preparedOn");
    draft.year = Number(fd.get("year"));
    draft.month = Number(fd.get("month"));
    draft.instructorId = String(fd.get("instructorId") || "").trim();
    draft.instructorKana = String(fd.get("instructorKana") || "").trim();
    draft.instructorName = String(fd.get("instructorName") || "").trim();
    draft.university = String(fd.get("university") || "").trim();
    draft.principal = String(fd.get("principal") || state.profile.principal || "").trim();
    draft.title = String(fd.get("title") || "").trim();
    draft.grade = String(fd.get("grade") || "").trim();
    draft.participants = fd.get("participants") === null || fd.get("participants") === "" ? "" : Number(fd.get("participants"));
    draft.summary = String(fd.get("summary") || "").trim();
    var sessions = [];
    form.querySelectorAll("[data-session]").forEach(function (row) {
      var i = row.getAttribute("data-session");
      var prev = draft.sessions[i] || {};
      var date = fd.get("date-" + i) || "";
      var session = {
        date: date,
        start: fd.get("start-" + i) || "",
        end: fd.get("end-" + i) || "",
        breakMinutes: Number(fd.get("break-" + i) || 0),
        content: String(fd.get("content-" + i) || "").trim()
      };
      if (prev.enteredWeekday && prev.date === date) session.enteredWeekday = prev.enteredWeekday;
      sessions.push(session);
    });
    draft.sessions = sessions.length ? sessions : [J.blankSession()];
  }

  function refreshComputed() {
    if (!draft) return;
    readForm();
    draft.sessions.forEach(function (s, i) {
      var wd = document.querySelector('[data-wd="' + i + '"]');
      var minsEl = document.querySelector('[data-mins="' + i + '"]');
      var mins = J.sessionMinutes(s);
      if (wd) wd.textContent = s.date ? J.weekday(s.date) : "";
      if (minsEl) minsEl.textContent = mins == null || mins < 0 ? "" : J.formatMinutes(mins);
    });
    var total = document.getElementById("total-label");
    if (total) {
      var cat = J.categoryOf(draft.category);
      total.textContent = "合計 " + (cat.unit === "count" ? J.documentCount(draft) + "回" : J.formatMinutes(J.documentMinutes(draft)));
    }
    var who = document.getElementById("doc-who");
    if (who) who.textContent = draft.instructorName || "";
    var personLabel = document.getElementById("person-label");
    if (personLabel && draft) personLabel.textContent = draft.instructorName || "（氏名未入力）";
    var prompt = document.getElementById("break-prompt");
    if (prompt) {
      var lines = breakMessages(draft);
      prompt.hidden = !lines.length;
      prompt.textContent = lines.join("\n");
    }
  }

  function teacherMonthDocs() {
    return state.documents.filter(function (d) {
      return (d.type === "plan" || d.type === "report") && Number(d.year) === Number(filter.year) && Number(d.month) === Number(filter.month);
    });
  }

  function viewCalendar() {
    return '<section class="panel"><div class="toolbar">' + monthFields() +
      '<button type="button" class="btn" data-action="export-ics" data-scope="teacher">この月をカレンダーファイルで書き出す</button></div>' +
      "<h2>" + J.esc(J.wareki(filter.year, filter.month)) + "の予定</h2>" +
      '<p class="small">自分が入力した活用計画と実績報告です。点線は活用計画、塗りつぶしは実績報告です。カレンダーファイルは Outlook などで開けます。形式はICSです。</p>' +
      reviewCalendar(teacherMonthDocs()) + "</section>";
  }

  function calendarCells(year, month) {
    var first = new Date(year, month - 1, 1).getDay();
    var days = new Date(year, month, 0).getDate();
    var cells = [];
    for (var i = 0; i < first; i++) cells.push(null);
    for (var d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  function amountText(doc) {
    var cat = J.categoryOf(doc.category);
    if (!cat) return "";
    return cat.unit === "count" ? J.documentCount(doc) + "回" : J.formatMinutes(J.documentMinutes(doc));
  }

  function filledSessions(doc) {
    var list = (doc.sessions || []).filter(function (s) { return s.date || s.start || s.end || s.content; });
    return list.length ? list : [J.blankSession()];
  }

  function activityGroups(docs) {
    var map = {};
    docs.forEach(function (doc) {
      var key = [doc.category, String(doc.instructorId || doc.instructorName || ""), String(doc.title || "")].join("|");
      if (!map[key]) {
        map[key] = {
          category: doc.category,
          title: doc.title || "（活動名未入力）",
          name: doc.instructorName || "（氏名未入力）",
          id: doc.instructorId || "",
          docs: []
        };
      }
      map[key].docs.push(doc);
    });
    return Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) {
      return String(a.title).localeCompare(String(b.title), "ja") || String(a.name).localeCompare(String(b.name), "ja");
    });
  }

  function monthLoaded() {
    return state.documents.filter(function (doc) {
      if (Number(doc.year) !== Number(filter.year) || Number(doc.month) !== Number(filter.month)) return false;
      if (filter.type === "plan" || filter.type === "report") return doc.type === filter.type;
      return true;
    });
  }

  function blockAmount(docs) {
    var cat = J.categoryOf(docs[0].category);
    if (!cat) return "";
    if (cat.unit === "count") {
      return docs.reduce(function (sum, doc) { return sum + J.documentCount(doc); }, 0) + "回";
    }
    return J.formatMinutes(docs.reduce(function (sum, doc) { return sum + J.documentMinutes(doc); }, 0));
  }

  function reviewTable(docs) {
    if (!docs.length) return '<p class="muted">表示する計画・報告はありません。</p>';
    var body = activityGroups(docs).map(function (group) {
      var cat = J.categoryOf(group.category);
      var head = '<tr class="group"><td colspan="6">' + J.esc((cat ? cat.label : "") + "　" + group.title + "　" + group.name) +
        (group.id ? "（" + J.esc(group.id) + "）" : "") + "</td></tr>";
      var lines = [];
      var ordered = group.docs.slice().sort(function (a, b) { return a.type === b.type ? 0 : a.type === "plan" ? -1 : 1; });
      var blocks = [];
      ordered.forEach(function (doc) {
        var last = blocks[blocks.length - 1];
        if (!last || last.type !== doc.type) blocks.push({ type: doc.type, docs: [doc] });
        else last.docs.push(doc);
      });
      blocks.forEach(function (block) {
        var plan = block.type === "plan";
        var kind = plan ? "is-plan" : "is-report";
        block.docs.forEach(function (doc) {
          var ready = J.validateDocument(doc).length === 0;
          filledSessions(doc).forEach(function (s) {
            var mins = J.sessionMinutes(s);
            lines.push('<tr class="' + kind + '"><td>' + (plan ? "活用計画" : "実績報告") + "</td><td>" +
              J.esc(s.date || "") + (s.date ? "（" + J.weekday(s.date) + "）" : "") + "</td><td>" +
              J.esc((s.start || "") + (s.start || s.end ? "–" : "") + (s.end || "")) + "</td><td>" +
              (mins == null || mins < 0 ? "" : J.formatMinutes(mins)) + "</td><td>" +
              J.esc(s.content || "") + "</td><td>" + (ready ? "提出できる" : "下書き") + "</td></tr>");
          });
        });
        lines.push('<tr class="kind-total ' + kind + '"><td colspan="3">' + (plan ? "計画の合計" : "実績の合計") +
          '</td><td class="group-total">' + J.esc(blockAmount(block.docs)) + '</td><td colspan="2"></td></tr>');
      });
      return head + lines.join("");
    }).join("");
    return '<div class="table-wrap"><table class="data"><thead><tr><th>種類</th><th>日</th><th>時刻</th><th>時間</th><th>その回の内容</th><th>状態</th></tr></thead><tbody>' +
      body + "</tbody></table></div>";
  }

  function clockMin(value) {
    var matched = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    if (!matched) return null;
    return Number(matched[1]) * 60 + Number(matched[2]);
  }

  function reviewCalendar(docs) {
    var year = filter.year;
    var month = filter.month;
    var cells = calendarCells(year, month);
    var byDate = {};
    docs.forEach(function (doc) {
      J.usableSessions(doc).forEach(function (session) {
        if (!byDate[session.date]) byDate[session.date] = [];
        byDate[session.date].push({ doc: doc, session: session });
      });
    });
    var html = cells.map(function (day) {
      if (!day) return '<div class="day out"></div>';
      var iso = year + "-" + J.pad2(month) + "-" + J.pad2(day);
      var dow = new Date(year, month - 1, day).getDay();
      var items = (byDate[iso] || []).slice().sort(function (a, b) {
        return String(a.session.start || "").localeCompare(String(b.session.start || ""));
      });
      var chips = items.map(function (item) {
        var plan = item.doc.type === "plan";
        var start = clockMin(item.session.start);
        var end = clockMin(item.session.end);
        var clash = !plan && items.some(function (other) {
          if (other.doc.type !== "report" || other === item) return false;
          if (String(other.doc.instructorId || other.doc.instructorName) !== String(item.doc.instructorId || item.doc.instructorName)) return false;
          var otherStart = clockMin(other.session.start);
          var otherEnd = clockMin(other.session.end);
          return start != null && end != null && otherStart != null && otherEnd != null && start < otherEnd && otherStart < end;
        });
        var range = (item.session.start || "") + "–" + (item.session.end || "");
        return '<button type="button" class="chip' + (plan ? " plan" : "") + (clash ? " overlap" : "") + '" style="background:' + J.colorWash(item.doc.instructorId || item.doc.title) + ";color:" + J.colorFor(item.doc.instructorId || item.doc.title) + '" data-action="edit" data-id="' + J.esc(item.doc.id) + '">' +
          "<b>" + J.esc(range) + "</b><span>" + J.esc(item.doc.title || "") + " " + J.esc(item.doc.instructorName || "") + "</span></button>";
      }).join("");
      return '<div class="day' + (dow === 0 ? " sun" : "") + (dow === 6 ? " sat" : "") + (iso === J.todayISO() ? " today" : "") + '"><div class="num">' + day + "</div>" + chips + "</div>";
    }).join("");
    return '<div class="legend"><span><i class="swatch" style="background:#ead0c6"></i>実績報告</span><span><i class="swatch" style="background:white;border:1px dashed #6aa4c8"></i>活用計画</span><span>赤枠は、同じ指導者の時間が重なっています。</span></div>' +
      '<div class="cal"><div class="cal-dow sun">日</div><div class="cal-dow">月</div><div class="cal-dow">火</div><div class="cal-dow">水</div><div class="cal-dow">木</div><div class="cal-dow">金</div><div class="cal-dow sat">土</div>' +
      html + "</div>";
  }

  function reconcileHtml() {
    var docs = state.documents.filter(function (doc) {
      return Number(doc.year) === Number(filter.year) && Number(doc.month) === Number(filter.month);
    });
    var rows = J.reconcileRows(docs);
    if (!rows.length) return '<p class="muted">この月の計画・報告はありません。</p>';
    var counts = {};
    rows.forEach(function (row) { counts[row.status] = (counts[row.status] || 0) + 1; });
    var summary = ["一致", "時間差", "日にちが違う", "報告がない", "計画がない"].filter(function (status) {
      return counts[status];
    }).map(function (status) { return status + " " + counts[status] + "件"; }).join("　");
    return (summary ? '<p class="note">' + J.esc(summary) + "</p>" : "") +
      '<div class="table-wrap"><table class="data"><thead><tr><th>指導者</th><th>活動</th><th>計画</th><th>実績</th><th>状態</th></tr></thead><tbody>' +
      rows.map(function (row) {
        var cls = row.status === "一致" ? "ok" : (row.status === "報告がない" || row.status === "計画がない" ? "bad" : "warn");
        return "<tr><td>" + J.esc(row.name) + "<div class=\"small\">" + J.esc(row.id) + "</div></td><td>" +
          J.esc(row.title) + "<div class=\"small\">" + J.esc(row.category) + "</div></td><td>" +
          (row.planMin == null ? "—" : J.formatMinutes(row.planMin)) + "</td><td>" +
          (row.reportMin == null ? "—" : J.formatMinutes(row.reportMin)) + '</td><td><span class="badge ' + cls + '">' + J.esc(row.status) + "</span></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function monthAll() {
    return state.documents.filter(function (doc) {
      return Number(doc.year) === Number(filter.year) && Number(doc.month) === Number(filter.month);
    });
  }

  function submittedDay(doc) {
    var matched = String(doc.submittedAt || doc.preparedOn || doc.updatedAt || "").match(/\d{4}-\d{2}-\d{2}/);
    return matched ? matched[0] : "";
  }

  function deadlineHtml() {
    var planDue = J.planDueISO(filter.year, filter.month);
    var reportDue = J.reportDueISO(filter.year, filter.month);
    var today = J.todayISO();
    var rows = monthAll().slice().sort(function (a, b) {
      return String(a.instructorName || "").localeCompare(String(b.instructorName || ""), "ja") || (a.type === b.type ? 0 : a.type === "plan" ? -1 : 1);
    });
    var counts = { "期限内": 0, "〆切後": 0, "要修正": 0 };
    var body = rows.map(function (doc) {
      var due = doc.type === "report" ? reportDue : planDue;
      var day = submittedDay(doc);
      var label = "期限内";
      var cls = "ok";
      if (J.validateDocument(doc).length) {
        label = "要修正";
        cls = "bad";
      } else if (day && day > due) {
        label = "〆切後";
        cls = "warn";
      }
      counts[label] += 1;
      return "<tr><td>" + (doc.type === "plan" ? "活用計画" : "実績報告") + "</td><td>" + J.esc(doc.instructorName || "") +
        "<div class=\"small\">" + J.esc(doc.instructorId || "") + "</div></td><td>" + J.esc(doc.title || "") + "</td><td>" +
        J.esc(day ? J.warekiFromISO(day) : "日付なし") + "</td><td>" + J.esc(J.warekiFromISO(due)) + '</td><td><span class="badge ' + cls + '">' + label + "</span></td></tr>";
    }).join("");
    var waiting = [];
    J.reconcileRows(monthAll()).forEach(function (row) {
      var who = (row.name || "氏名未入力") + "「" + (row.title || "活動名なし") + "」";
      if (row.status === "報告がない") {
        waiting.push(who + "の実績報告は、" + (today > reportDue ? "〆切を過ぎてもフォルダにありません。" : "まだフォルダにありません。〆切は " + J.warekiFromISO(reportDue) + " です。"));
      }
      if (row.status === "計画がない" && today > planDue) {
        waiting.push(who + "の活用計画は、〆切を過ぎてもフォルダにありません。");
      }
    });
    var summary = ["期限内", "〆切後", "要修正"].filter(function (label) { return counts[label]; }).map(function (label) {
      return label + " " + counts[label] + "件";
    }).join("　");
    return '<p class="note">活用計画の〆切は ' + J.esc(J.warekiFromISO(planDue)) + "（前月末）。実績報告の〆切は " + J.esc(J.warekiFromISO(reportDue)) + "（翌月3日）です。" +
      (summary ? " " + J.esc(summary) + "。" : "") + "</p>" +
      (body
        ? '<div class="table-wrap"><table class="data"><thead><tr><th>種類</th><th>指導者</th><th>活動</th><th>提出日</th><th>〆切</th><th>状態</th></tr></thead><tbody>' + body + "</tbody></table></div>"
        : '<p class="muted">この月のファイルはまだありません。</p>') +
      (waiting.length ? "<ul>" + waiting.map(function (line) { return "<li>" + J.esc(line) + "</li>"; }).join("") + "</ul>" : "");
  }

  function reviewIssues(docs) {
    var lines = [];
    docs.forEach(function (doc) {
      var kind = doc.type === "plan" ? "活用計画" : "実績報告";
      var who = (doc.instructorName || "氏名未入力") + "（" + (doc.instructorId || "番号なし") + "）「" + (doc.title || "活動名なし") + "」";
      var monthPrefix = J.monthKey(doc.year, doc.month);
      (doc.sessions || []).filter(function (session) {
        return session && (session.date || session.start || session.end || session.content);
      }).forEach(function (session, index) {
        var where = kind + " " + who + "の" + (index + 1) + "行目";
        if (!session.date || !session.start || !session.end) {
          lines.push(where + "は、日付・開始・終了が揃っていません。");
          return;
        }
        if (String(session.date).slice(0, 7) !== monthPrefix) lines.push(where + "の日付が、対象月と違います。");
        var written = session.enteredWeekday;
        var actual = J.weekday(session.date);
        if (written && actual && written !== actual) {
          lines.push(kind + " " + who + "の" + J.warekiFromISO(session.date) + "は" + actual + "曜日ですが、" + written + "曜日と書かれています。");
        }
        var span = J.minutesBetween(session.start, session.end);
        var br = Number(session.breakMinutes) || 0;
        if (span != null && span > 0 && br >= span) lines.push(where + "は、休憩が活動時間以上です。");
        else if ((doc.category === "subject" || doc.category === "kodomo") && span != null && span >= 90 && br === 0) {
          lines.push(where + "は、開始から終了が" + span + "分あり、休憩がありません。");
        }
      });
    });
    var slots = [];
    docs.forEach(function (doc) {
      if (doc.type !== "report") return;
      J.usableSessions(doc).forEach(function (session) {
        var start = clockMin(session.start);
        var end = clockMin(session.end);
        if (!session.date || start == null || end == null) return;
        slots.push({ doc: doc, session: session, start: start, end: end });
      });
    });
    var seen = {};
    slots.forEach(function (slot) {
      slots.forEach(function (other) {
        if (slot === other || slot.session.date !== other.session.date) return;
        if (String(slot.doc.instructorId || slot.doc.instructorName) !== String(other.doc.instructorId || other.doc.instructorName)) return;
        if (!(slot.start < other.end && other.start < slot.end)) return;
        var key = [slot.doc.id, other.doc.id, slot.session.date, slot.start, other.start].sort().join("|");
        if (seen[key]) return;
        seen[key] = true;
        lines.push((slot.doc.instructorName || "") + "の" + J.warekiFromISO(slot.session.date) + " " + slot.session.start + "–" + slot.session.end +
          " が、「" + (other.doc.title || "") + "」" + other.session.start + "–" + other.session.end + " と重なっています。");
      });
    });
    return lines;
  }

  function viewExport(message) {
    var folderNote = message && message.place === "folder" ? message : null;
    var docs = monthAll();
    var issues = reviewIssues(docs);
    var issueHtml = !docs.length
      ? '<p class="muted">この月のファイルはまだありません。</p>'
      : (issues.length
        ? "<ul>" + issues.map(function (line) { return "<li>" + J.esc(line) + "</li>"; }).join("") + "</ul>"
        : '<p class="muted">この月の計画・報告で、確認が必要な点はありません。</p>');
    return '<section class="panel no-print"><h2>活動月のフォルダ</h2>' +
      noticeHtml(folderNote) +
      '<p class="lead">担当から届いたファイルを、学校ごとのフォルダに集めます。10月なら、9月に受け取った10月の活用計画と、10月に届いた実績報告を同じ学校フォルダに入れます。確認が終わったら、その学校フォルダを、教育センターの毎月のフォルダの中へ入れます。</p>' +
      '<label class="field">活動月のフォルダ<input id="work-folder" type="file" webkitdirectory directory multiple></label>' +
      '<p class="small">フォルダの中の担当のファイルを読み込んで、〆切と内容を確認します。実績が増えたときは、同じフォルダをもう一度開きます。ファイルはExcelです。担当が提出したファイルを、そのまま読みます。</p></section>' +
      '<section class="panel no-print"><h2>〆切</h2>' +
      '<div class="toolbar">' + monthFields() + "</div>" +
      deadlineHtml() + "</section>" +
      '<section class="panel no-print"><h2>内容の確認</h2>' +
      '<p class="small">日付が対象月と違う行、曜日の違い、休憩が活動時間以上の行、教科等と認定こども園で開始から終了が90分以上なのに休憩がない行、同じ指導者の実績が重なっている時間を出します。</p>' +
      (issueHtml) +
      "</section>" +
      '<section class="panel no-print"><h2>教科・クラブの確認</h2>' +
      '<div class="toolbar">' +
      '<div class="seg"><button type="button" class="' + (filter.type !== "plan" && filter.type !== "report" ? "active" : "") + '" data-action="filter-type" data-type="all">すべて</button>' +
      '<button type="button" class="' + (filter.type === "plan" ? "active" : "") + '" data-action="filter-type" data-type="plan">活用計画</button>' +
      '<button type="button" class="' + (filter.type === "report" ? "active" : "") + '" data-action="filter-type" data-type="report">実績報告</button></div>' +
      '<div class="seg"><button type="button" class="' + (reviewMode === "list" ? "active" : "") + '" data-action="review" data-mode="list">一覧表</button>' +
      '<button type="button" class="' + (reviewMode === "calendar" ? "active" : "") + '" data-action="review" data-mode="calendar">カレンダー</button></div>' +
      (reviewMode === "calendar" ? '<button type="button" class="btn" data-action="export-ics" data-scope="manager">この月をカレンダーファイルで書き出す</button>' : "") +
      "</div>" +
      '<p class="small">各担当のファイルにある、教科・クラブごとの計画と報告です。' +
      (reviewMode === "calendar" ? "カレンダーファイルは Outlook などで開けます。形式はICSです。" : "") + "</p>" +
      (reviewMode === "calendar" ? reviewCalendar(monthLoaded()) : reviewTable(monthLoaded())) + "</section>" +
      '<section class="panel no-print"><h2>計画と実績の突合</h2>' +
      '<p class="small">同じ指導者・同じ活動の活用計画と実績報告を比べます。実績報告がまだフォルダに無い計画は「報告がない」になります。時間や日にちが違うときは、担当へ戻してファイルを出し直してもらいます。</p>' +
      reconcileHtml() + "</section>";
  }

  function viewProfile() {
    var p = state.profile;
    var schools = J.sortSchools(J.defaultSchools());
    var known = schools.some(function (s) { return s.name === p.schoolName; });
    if (p.schoolName && !known) schools.unshift({ name: p.schoolName, kind: p.schoolKind || "elementary", code: p.schoolCode || "" });
    var current = p.schoolName ? [p.schoolName, p.schoolKind || "", J.schoolCodeOf({ code: p.schoolCode }) || ""].join("|") : "";
    return '<section class="panel"><h2>学校の設定</h2>' +
      '<div class="grid-form"><label class="field span-2">学校園<select id="profile-school"><option value="">学校園を選ぶ</option>' +
      schools.map(function (s) {
        var code = J.schoolCodeOf(s);
        return option([s.name, s.kind || "", code || ""].join("|"), (code ? code + "　" : "") + s.name, current);
      }).join("") +
      "</select></label>" +
      '<label class="field">学校番号<input id="profile-school-code" readonly value="' + J.esc(J.schoolCodeOf({ code: p.schoolCode }) || "") + '"></label>' +
      '<label class="field span-2">校園長名<input id="profile-principal" value="' + J.esc(p.principal) + '"></label></div>' +
      '<p class="small">学校園を選ぶと、市の学校番号が入ります。</p>' +
      '<div class="toolbar"><button class="btn btn-primary" data-action="save-profile">設定を保存</button></div></section>';
  }

  function viewTalent() {
    var list = state.profile.roster || [];
    var rows = list.map(function (p) {
      var text = [p.id, p.name, p.category].join(" ");
      return '<tr data-text="' + J.esc(text) + '"><td>' + J.esc(p.id) + "</td><td>" + J.esc(p.name) + "</td><td>" + J.esc(p.category || "") + "</td></tr>";
    }).join("");
    return '<section class="panel"><h2>活用したい人材を探す</h2>' +
      '<p class="lead">教育センターから受け取った指導者リストを開きます。登録番号、指導者名、カテゴリーで探せます。計画や報告の記入内容は、この一覧では変わりません。</p>' +
      '<label class="field">指導者リストを開く<input id="talent-file" type="file" accept="application/json,.json"></label>' +
      '<p class="small">ファイルの形式はJSONです。読み込み済み ' + list.length + "人</p>" +
      (list.length
        ? '<label class="field">探す<input id="talent-query" placeholder="名前、登録番号、カテゴリー"></label>' +
          '<div class="table-wrap"><table class="data"><thead><tr><th>登録番号</th><th>指導者名</th><th>カテゴリー</th></tr></thead><tbody id="talent-rows">' +
          rows + "</tbody></table></div>" +
          '<p class="small" id="talent-empty" hidden>該当する指導者はいません。</p>'
        : "") +
      "</section>";
  }

  function talentPerson(p) {
    var category = String(p.category || "").trim();
    if (!category && Array.isArray(p.fields)) category = p.fields.filter(Boolean).join("、");
    return { id: String(p.id || ""), name: p.name || "", category: category };
  }

  function draftMatchesSaved() {
    if (!draft) return true;
    var stored = state.documents.find(function (d) { return d.id === draft.id; });
    if (!stored) return false;
    var keys = ["type", "category", "year", "month", "preparedOn", "instructorId", "instructorKana", "instructorName", "university", "principal", "title", "grade", "participants", "summary"];
    var i;
    for (i = 0; i < keys.length; i++) {
      if (String(stored[keys[i]] == null ? "" : stored[keys[i]]) !== String(draft[keys[i]] == null ? "" : draft[keys[i]])) return false;
    }
    var left = stored.sessions || [];
    var right = draft.sessions || [];
    if (left.length !== right.length) return false;
    for (i = 0; i < left.length; i++) {
      if (String(left[i].date || "") !== String(right[i].date || "")) return false;
      if (String(left[i].start || "") !== String(right[i].start || "")) return false;
      if (String(left[i].end || "") !== String(right[i].end || "")) return false;
      if (Number(left[i].breakMinutes || 0) !== Number(right[i].breakMinutes || 0)) return false;
      if (String(left[i].content || "") !== String(right[i].content || "")) return false;
    }
    return true;
  }

  function closeUnsavedForMonth(nextYear, nextMonth) {
    if (!draft) return;
    if (document.getElementById("doc-form")) readForm();
    var saved = draftMatchesSaved();
    var sameMonth = Number(draft.year) === Number(nextYear) && Number(draft.month) === Number(nextMonth);
    if (!saved) {
      draft = null;
      submitPreview = null;
      formMessage = { type: "ok", place: "list", text: "保存していない内容は取り消しました。" };
      return;
    }
    if (!sameMonth) draft = null;
  }

  function newDoc(type) {
    if (!state.profile.schoolName) {
      alert("先に「学校の設定」で学校園を選んで保存してください。");
      state.tab = "profile";
      render();
      return;
    }
    draft = {
      id: J.uid(),
      type: type,
      category: state.profile.schoolKind === "kodomo" ? "kodomo" : "subject",
      year: filter.year,
      month: filter.month,
      preparedOn: J.todayISO(),
      principal: state.profile.principal,
      instructorId: "",
      instructorKana: "",
      instructorName: "",
      university: "",
      title: "",
      grade: "",
      participants: "",
      summary: "",
      sessions: [J.blankSession()]
    };
    render();
  }

  function saveDoc() {
    readForm();
    var errors = J.validateDocument(draft);
    if (errors.length) {
      formMessage = { type: "bad", place: "form", text: "保存できません。\n" + errors.join("\n") };
      render();
      return;
    }
    draft.wip = false;
    draft.updatedAt = new Date().toISOString();
    var idx = state.documents.findIndex(function (d) { return d.id === draft.id; });
    if (idx >= 0) state.documents[idx] = draft;
    else state.documents.push(draft);
    filter.year = draft.year;
    filter.month = draft.month;
    var label = draft.type === "plan" ? "活用計画" : "実績報告";
    if (!save()) {
      formMessage = { type: "bad", place: "form", text: "このパソコンの画面には保存できませんでした。右上のボタンでファイルに残してください。" };
      render();
      return;
    }
    formMessage = { type: "ok", place: "form", text: label + "を保存しました。" };
    render();
  }

  function saveStateFile() {
    if (draft && document.getElementById("doc-form")) rememberDraft();
    var documents = state.documents.map(publishCopy);
    if (!documents.length) {
      alert("保存する計画・報告がありません。");
      return;
    }
    save();
    J.downloadExcel(workFileName(), J.handoffWorkbook(handoffPayload("work", documents)));
    var note = document.getElementById("state-note");
    if (note) note.textContent = "保存しました。";
  }

  function fileSchoolName() {
    return String(state.profile.schoolName || "学校未設定").replace(/[\\/:*?"<>|]/g, "");
  }

  function safeFilePart(value) {
    return String(value || "").trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "");
  }

  function handoffPayload(handoff, documents) {
    var payload = {
      schema: J.SCHEMA_WORK,
      version: 1,
      handoff: handoff,
      savedAt: new Date().toISOString(),
      school: {
        name: state.profile.schoolName,
        code: J.schoolCodeOf({ code: state.profile.schoolCode }) || J.schoolCodeOf(J.knownSchool(state.profile.schoolName)) || "",
        kind: state.profile.schoolKind,
        principal: state.profile.principal
      },
      documents: documents
    };
    if (handoff !== "work") {
      var year = documents[0] ? documents[0].year : filter.year;
      var month = documents[0] ? documents[0].month : filter.month;
      payload.period = J.monthKey(year, month);
    }
    return payload;
  }

  function publishCopy(doc) {
    var copy = JSON.parse(JSON.stringify(doc));
    copy.wip = J.validateDocument(copy).length > 0;
    delete copy.schoolName;
    return copy;
  }

  function workFileName(year, month) {
    var y = year == null ? filter.year : year;
    var m = month == null ? filter.month : month;
    return J.wareki(y, m) + "作業ファイル_" + fileSchoolName() + ".xlsx";
  }

  function nextMonthOf(year, month) {
    var y = Number(year);
    var m = Number(month) + 1;
    if (m > 12) return { year: y + 1, month: 1 };
    return { year: y, month: m };
  }

  function shiftSessionDate(iso, targetYear, targetMonth) {
    var matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!matched) return iso || "";
    var source = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
    if (isNaN(source.getTime())) return iso;
    var last = new Date(Number(targetYear), Number(targetMonth), 0).getDate();
    var anchorDay = Math.min(source.getDate(), last);
    var anchor = new Date(Number(targetYear), Number(targetMonth) - 1, anchorDay);
    var delta = source.getDay() - anchor.getDay();
    if (delta > 3) delta -= 7;
    if (delta < -3) delta += 7;
    var moved = new Date(Number(targetYear), Number(targetMonth) - 1, anchorDay + delta);
    if (moved.getFullYear() !== Number(targetYear) || moved.getMonth() + 1 !== Number(targetMonth)) {
      moved = new Date(Number(targetYear), Number(targetMonth) - 1, anchorDay + delta + (delta < 0 ? 7 : -7));
    }
    if (moved.getFullYear() !== Number(targetYear) || moved.getMonth() + 1 !== Number(targetMonth)) return iso;
    return moved.getFullYear() + "-" + J.pad2(moved.getMonth() + 1) + "-" + J.pad2(moved.getDate());
  }

  function addDaysIso(iso, days) {
    var matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!matched) return iso || "";
    var date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]) + days);
    return date.getFullYear() + "-" + J.pad2(date.getMonth() + 1) + "-" + J.pad2(date.getDate());
  }

  function inMonthIso(iso, year, month) {
    var matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return !!matched && Number(matched[1]) === Number(year) && Number(matched[2]) === Number(month);
  }

  function shiftPlanSessions(sessions, targetYear, targetMonth) {
    var order = [];
    (sessions || []).forEach(function (session, index) {
      if (session && session.date) order.push({ index: index, iso: session.date });
    });
    order.sort(function (a, b) {
      if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
      return a.index - b.index;
    });
    var used = {};
    order.forEach(function (item) {
      var choices = [];
      var preferred = shiftSessionDate(item.iso, targetYear, targetMonth);
      var forward = preferred;
      var back = preferred;
      choices.push(preferred);
      var step;
      for (step = 0; step < 5; step++) {
        forward = addDaysIso(forward, 7);
        if (inMonthIso(forward, targetYear, targetMonth)) choices.push(forward);
        back = addDaysIso(back, -7);
        if (inMonthIso(back, targetYear, targetMonth)) choices.push(back);
      }
      var picked = preferred;
      var i;
      for (i = 0; i < choices.length; i++) {
        if (!used[choices[i]]) {
          picked = choices[i];
          break;
        }
      }
      used[picked] = true;
      sessions[item.index].date = picked;
      delete sessions[item.index].enteredWeekday;
    });
  }

  function advanceToNextMonth() {
    if (draft && document.getElementById("doc-form")) rememberDraft();
    var year = Number(filter.year);
    var month = Number(filter.month);
    var plans = state.documents.filter(function (doc) {
      return doc.type === "plan" && Number(doc.year) === year && Number(doc.month) === month;
    });
    if (!plans.length) {
      alert(month + "月の活用計画がありません。");
      return;
    }
    var next = nextMonthOf(year, month);
    var fromLabel = J.wareki(year, month);
    var toLabel = J.wareki(next.year, next.month);
    var fileName = workFileName(year, month);
    var fileStem = fileName.replace(/\.xlsx$/, "");
    var saved = confirm("保存しますか？\n" + fileStem + "\n\nこのあと、" + fromLabel + "の実績報告を消し、活用計画を" + toLabel + "にします。\nOKで保存してから進めます。キャンセルでは保存せずに進めます。");
    if (saved) {
      var monthDocs = state.documents.filter(function (doc) {
        return Number(doc.year) === year && Number(doc.month) === month;
      }).map(publishCopy);
      J.downloadExcel(fileName, J.handoffWorkbook(handoffPayload("work", monthDocs)));
    }
    state.documents = state.documents.filter(function (doc) {
      return !(doc.type === "report" && Number(doc.year) === year && Number(doc.month) === month);
    }).map(function (doc) {
      if (!(doc.type === "plan" && Number(doc.year) === year && Number(doc.month) === month)) return doc;
      var copy = JSON.parse(JSON.stringify(doc));
      copy.id = J.uid();
      copy.year = next.year;
      copy.month = next.month;
      copy.preparedOn = J.todayISO();
      copy.updatedAt = new Date().toISOString();
      shiftPlanSessions(copy.sessions, next.year, next.month);
      copy.wip = J.validateDocument(copy).length > 0;
      return copy;
    });
    filter.year = next.year;
    filter.month = next.month;
    filter.type = "all";
    draft = null;
    submitPreview = null;
    pickedSubmit = {};
    var text = toLabel + "の活用計画にしました。" + fromLabel + "の実績報告は消しています。";
    if (saved) text += fileName.replace(/\.xlsx$/, "") + "を保存しました。";
    formMessage = { type: "ok", place: "list", text: text };
    state.tab = "docs";
    save();
    render();
  }

  function rememberDraft() {
    if (!draft) return;
    if (document.getElementById("doc-form")) readForm();
    draft.wip = J.validateDocument(draft).length > 0;
    draft.updatedAt = new Date().toISOString();
    var idx = state.documents.findIndex(function (d) { return d.id === draft.id; });
    var copy = JSON.parse(JSON.stringify(draft));
    if (idx >= 0) state.documents[idx] = copy;
    else state.documents.push(copy);
  }

  function applyFolder(docs, skipped, schools) {
    if (!docs.length) {
      alert(skipped.length
        ? "読み込めるファイルがありません。担当が提出したExcelを、学校のフォルダに入れてください。"
        : "読み込めた計画・報告がありません。");
      return;
    }
    if (state.documents.length && !confirm("このフォルダの計画と実績報告を、学校の確認データにします。いま画面にある内容は、フォルダの中身に置き換わります。")) return;
    var byId = {};
    docs.forEach(function (doc) {
      var prev = byId[doc.id];
      if (!prev || String(doc.updatedAt || "") >= String(prev.updatedAt || "")) byId[doc.id] = doc;
    });
    var bySlot = {};
    Object.keys(byId).forEach(function (id) {
      var doc = byId[id];
      var key = J.activityKey(doc);
      var prev = bySlot[key];
      if (!prev || String(doc.updatedAt || "") >= String(prev.updatedAt || "")) bySlot[key] = doc;
    });
    var list = Object.keys(bySlot).map(function (key) {
      var doc = bySlot[key];
      doc.wip = J.validateDocument(doc).length > 0;
      return doc;
    });
    state.documents = list;
    var names = Object.keys(schools);
      if (names.length === 1) {
      var school = schools[names[0]];
      state.profile.schoolName = school.name;
      if (school.kind) state.profile.schoolKind = school.kind;
      if (school.principal) state.profile.principal = school.principal;
      if (J.schoolCodeOf(school)) state.profile.schoolCode = J.schoolCodeOf(school);
      else {
        state.profile.schoolCode = "";
        applyKnownSchool();
      }
    }
    var counts = {};
    list.forEach(function (doc) {
      var key = Number(doc.year) + "-" + Number(doc.month);
      counts[key] = (counts[key] || 0) + 1;
    });
    var bestKey = "";
    var bestCount = -1;
    Object.keys(counts).forEach(function (key) {
      if (counts[key] > bestCount) {
        bestKey = key;
        bestCount = counts[key];
      }
    });
    var parts = bestKey.split("-");
    filter.year = Number(parts[0]);
    filter.month = Number(parts[1]);
    filter.type = "all";
    draft = null;
    var plans = list.filter(function (doc) {
      return doc.type === "plan" && Number(doc.year) === Number(filter.year) && Number(doc.month) === Number(filter.month);
    }).length;
    var reports = list.filter(function (doc) {
      return doc.type === "report" && Number(doc.year) === Number(filter.year) && Number(doc.month) === Number(filter.month);
    }).length;
    var otherMonths = list.length - plans - reports;
    var text = J.monthKey(filter.year, filter.month) + " のフォルダを読み込みました。活用計画" + plans + "件、実績報告" + reports + "件。";
    if (!reports) text += "実績報告はまだありません。届いたら同じフォルダに足して、もう一度開いてください。";
    if (otherMonths) text += "ほかの月の書類も" + otherMonths + "件あります。年月を切り替えて確認できます。";
    if (names.length > 1) text += "学校名がファイルによって違います。";
    if (skipped.length) text += "読み込まなかったファイルが" + skipped.length + "件あります。";
    formMessage = { type: names.length > 1 || skipped.length ? "bad" : "ok", place: "folder", text: text };
    state.tab = "export";
    save();
    render();
  }

  function openWorkFolder(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (file) {
      return /\.xlsx?$/i.test(file.name) || /\.xls$/i.test(file.name) || /\.json$/i.test(file.name);
    });
    if (!files.length) {
      alert("フォルダの中に読み込めるファイルがありません。");
      return;
    }
    var pending = files.length;
    var docs = [];
    var skipped = [];
    var schools = {};
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var json = J.payloadFromFile(file.name, new Uint8Array(reader.result));
          if (!json || json.error || !Array.isArray(json.documents)) skipped.push(file.name);
          else if (json.schema !== J.SCHEMA_WORK && json.schema !== J.SCHEMA_SUBMISSION) skipped.push(file.name);
          else {
            if (json.school && json.school.name) schools[json.school.name] = json.school;
            json.documents.forEach(function (doc) {
              if (!doc || (doc.type !== "plan" && doc.type !== "report")) return;
              if (!doc.id) doc.id = J.uid();
              if (json.school && json.school.name && !doc.schoolName) doc.schoolName = json.school.name;
              if (json.savedAt) doc.submittedAt = json.savedAt;
              doc.sourceName = file.name;
              docs.push(doc);
            });
          }
        } catch (err) {
          skipped.push(file.name);
        }
        pending -= 1;
        if (pending === 0) applyFolder(docs, skipped, schools);
      };
      reader.onerror = function () {
        skipped.push(file.name);
        pending -= 1;
        if (pending === 0) applyFolder(docs, skipped, schools);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function workDocsFrom(json) {
    if (!json || !Array.isArray(json.documents) || (json.schema !== J.SCHEMA_WORK && json.schema !== J.SCHEMA_SUBMISSION)) {
      alert("このファイルは開けません。保存したExcelか、提出したExcelを選んでください。");
      return null;
    }
    var incoming = json.documents.filter(function (doc) { return doc && (doc.type === "plan" || doc.type === "report"); }).map(function (doc) {
      if (!doc.id) doc.id = J.uid();
      doc.wip = J.validateDocument(doc).length > 0;
      delete doc.schoolName;
      return doc;
    });
    if (!incoming.length) {
      alert("このファイルには計画・報告が入っていません。");
      return null;
    }
    return incoming;
  }

  function takeSchool(json) {
    if (!json.school || !json.school.name) return;
    state.profile.schoolName = json.school.name;
    if (json.school.kind) state.profile.schoolKind = json.school.kind;
    if (json.school.principal) state.profile.principal = json.school.principal;
    if (J.schoolCodeOf(json.school)) state.profile.schoolCode = J.schoolCodeOf(json.school);
    else {
      state.profile.schoolCode = "";
      applyKnownSchool();
    }
  }

  function showWorkMonth(incoming) {
    var inMonth = incoming.some(function (d) {
      return Number(d.year) === Number(filter.year) && Number(d.month) === Number(filter.month);
    });
    if (!inMonth) {
      var latest = incoming.slice().sort(function (a, b) {
        return Number(b.year) - Number(a.year) || Number(b.month) - Number(a.month);
      })[0];
      filter.year = Number(latest.year);
      filter.month = Number(latest.month);
    }
    filter.type = "all";
  }

  function openWorkFile(json) {
    var incoming = workDocsFrom(json);
    if (!incoming) return;
    if ((state.documents.length || draft) && !confirm("このファイルの内容にします。いま画面にある計画・報告は、ファイルの内容になります。")) return;
    state.documents = incoming;
    showWorkMonth(incoming);
    takeSchool(json);
    draft = null;
    submitPreview = null;
    state.tab = "docs";
    save();
    render();
  }

  function addWorkFile(json) {
    var incoming = workDocsFrom(json);
    if (!incoming) return;
    if (draft && document.getElementById("doc-form")) rememberDraft();
    var added = 0;
    var updated = 0;
    incoming.forEach(function (doc) {
      var idx = state.documents.findIndex(function (item) { return item.id === doc.id; });
      if (idx >= 0) {
        state.documents[idx] = doc;
        updated += 1;
      } else {
        state.documents.push(doc);
        added += 1;
      }
    });
    if (!state.profile.schoolName) takeSchool(json);
    showWorkMonth(incoming);
    if (draft && incoming.some(function (doc) { return doc.id === draft.id; })) draft = null;
    var parts = [];
    if (added) parts.push("追加" + added + "件");
    if (updated) parts.push("同じ書類を更新" + updated + "件");
    var text = (parts.join("、") || "追加する計画・報告はありませんでした") + "。";
    if (json.school && json.school.name && state.profile.schoolName && json.school.name !== state.profile.schoolName) {
      text += "ファイルの学校は" + json.school.name + "です。この画面の学校は" + state.profile.schoolName + "のままです。";
    }
    formMessage = { type: "ok", place: "list", text: text };
    state.tab = "docs";
    save();
    render();
  }

  function activityMatchKey(doc) {
    var who = String(doc.instructorId || "").trim() || String(doc.instructorName || "").trim();
    return [Number(doc.year), Number(doc.month), who, doc.category || "", String(doc.title || "").trim()].join("|");
  }

  function listedDocs() {
    var items = monthDocsOf("plan").concat(monthDocsOf("report"));
    if (draft && Number(draft.year) === Number(filter.year) && Number(draft.month) === Number(filter.month) &&
      !items.some(function (d) { return d.id === draft.id; })) items.push(draft);
    return items;
  }

  function submitFileName(documents) {
    var first = documents[0];
    var kind = first.type === "report" ? "実績" : "計画";
    var month = J.monthKey(first.year, first.month);
    var sameMonth = documents.every(function (doc) { return J.monthKey(doc.year, doc.month) === month; });
    if (!sameMonth) month = J.monthKey(filter.year, filter.month);
    var same = documents.every(function (doc) { return activityMatchKey(doc) === activityMatchKey(first); });
    if (same) {
      var parts = [kind, month];
      var title = safeFilePart(first.title);
      var who = safeFilePart(first.instructorName);
      if (title) parts.push(title);
      if (who) parts.push(who);
      return parts.join("_") + ".xlsx";
    }
    return kind + "_" + fileSchoolName() + "_" + month + ".xlsx";
  }

  function downloadSubmit(documents) {
    if (!window.XLSX) {
      alert("Excelを書き出す準備ができていません。");
      return 0;
    }
    var groups = ["plan", "report"].map(function (type) {
      return documents.filter(function (doc) { return doc.type === type; });
    }).filter(function (list) { return list.length; });
    groups.forEach(function (list, index) {
      setTimeout(function () {
        J.downloadExcel(submitFileName(list), J.handoffWorkbook(handoffPayload(list[0].type, list.map(publishCopy))));
      }, index * 400);
    });
    return groups.length;
  }

  function submitPool() {
    if (draft && document.getElementById("doc-form")) readForm();
    var pool = state.documents.map(function (doc) {
      return draft && doc.id === draft.id ? draft : doc;
    });
    if (draft && !pool.some(function (doc) { return doc.id === draft.id; })) pool.push(draft);
    return pool;
  }

  function submitGaps(doc) {
    var errors = J.validateDocument(doc).slice();
    if (!String(doc.instructorKana || "").trim()) errors.push("ふりがながありません。");
    if (!String(doc.summary || "").trim()) errors.push("活動内容の概要がありません。");
    if (!String(doc.preparedOn || "").trim()) errors.push("作成日がありません。");
    var cat = J.categoryOf(doc.category);
    if (cat.hasGrade) {
      if (!String(doc.grade || "").trim()) errors.push("対象学年がありません。");
      if (doc.participants === "" || doc.participants == null) errors.push("参加人数がありません。");
    }
    if (doc.category !== "university" && !String(doc.principal || state.profile.principal || "").trim()) {
      errors.push("校園長名がありません。");
    }
    (doc.sessions || []).filter(function (session) {
      return session && (session.date || session.start || session.end || session.content);
    }).forEach(function (session, index) {
      if (!String(session.content || "").trim()) errors.push((index + 1) + "行目の活動内容がありません。");
    });
    breakMessages(doc).forEach(function (text) { errors.push(text); });
    return errors;
  }

  function breakMessages(doc) {
    return J.breakShortfalls(doc, state.documents).map(function (item) {
      var together = item.shared ? "同じ指導者の活動を合わせた" : "";
      var rule = item.need === 60
        ? "8時間を超えるので、休憩を60分以上にしてください。"
        : "6時間を超えるので、休憩を45分以上にしてください。";
      return item.label + "の" + together + "労働時間は" + J.formatMinutes(item.work) + "、休憩は" + item.breakMinutes + "分です。" + rule;
    });
  }

  function breakPromptHtml(doc) {
    var lines = breakMessages(doc);
    return '<p id="break-prompt" class="alert warn"' + (lines.length ? "" : " hidden") + ">" + J.esc(lines.join("\n")) + "</p>";
  }

  function gapText(doc) {
    var kind = doc.type === "plan" ? "活用計画" : "実績報告";
    return (doc.instructorName || "（氏名未入力）") + "／" + (doc.title || "（活動名未入力）") + "（" + kind + "）\n" +
      submitGaps(doc).join("\n");
  }

  function openSubmitPreview(documents, note) {
    submitPreview = documents.slice().sort(function (a, b) {
      if (a.type !== b.type) return a.type === "plan" ? -1 : 1;
      return String(a.instructorName || "").localeCompare(String(b.instructorName || ""), "ja");
    }).map(function (doc) { return JSON.parse(JSON.stringify(doc)); });
    previewNote = note || "";
    render();
  }

  function submitPerson(id) {
    var pool = submitPool();
    var clicked = pool.find(function (d) { return d.id === id; });
    if (!clicked) return;
    var gaps = submitGaps(clicked);
    if (gaps.length) {
      alert("未入力があります。\n" + gaps.join("\n"));
      return;
    }
    if (draft && document.getElementById("doc-form")) rememberDraft();
    save();
    openSubmitPreview([clicked], "");
  }

  function clockHours(mins) {
    if (mins == null || mins < 0) return "";
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h + ":" + (m < 10 ? "0" : "") + m;
  }

  function previewDay(iso, doc) {
    var matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!matched) return "";
    if (Number(matched[1]) !== Number(doc.year) || Number(matched[2]) !== Number(doc.month)) return iso;
    return String(Number(matched[3]));
  }

  function previewForm(doc) {
    var cat = J.categoryOf(doc.category);
    var university = doc.category === "university";
    var club = doc.category === "club";
    var formMark = university ? "（大学連携）" : (club ? "（様式２）" : (doc.category === "kodomo" ? "（認定こども園）" : "（様式１）"));
    var formName = university ? "大学連携" : (club ? "部活動活用" : (doc.category === "kodomo" ? "認定こども園づくり" : "教科等活用"));
    var kind = doc.type === "plan" ? "活用計画" : "実績報告";
    var verb = doc.type === "plan" ? "計画します。" : "報告します。";
    var reiwa = Number(doc.year) - 2018;
    var reiwaText = reiwa === 1 ? "元" : (reiwa > 0 ? String(reiwa) : "");
    var sessions = filledSessions(doc);
    var rows = sessions.map(function (session, index) {
      var mins = J.sessionMinutes(session);
      var time = (session.start || "") + ((session.start || session.end) ? " ～ " : "") + (session.end || "");
      return "<tr><td class=\"center\">" + (index + 1) + "</td><td class=\"center\">" + J.esc(previewDay(session.date, doc)) + "</td><td class=\"center\">" +
        J.esc(session.date ? J.weekday(session.date) : "") + "</td><td class=\"center\">" + J.esc(time) + "</td><td class=\"center\">" +
        clockHours(mins) + "</td>" +
        "<td class=\"center\">" + (Number(session.breakMinutes) || 0) + "分</td>" +
        "<td>" + J.esc(session.content || "") + "</td></tr>";
    }).join("");
    var totalLabel = university ? "活動回数" : "活動時間数";
    var totalValue = university ? String(J.documentCount(doc)) : clockHours(J.documentMinutes(doc));
    var totalUnit = university ? "回" : "時間";
    var tailSpan = 2;
    var school = state.profile.schoolName ? "守口市立" + state.profile.schoolName : "";
    var principal = doc.principal || state.profile.principal || "";
    var principalText = principal.indexOf("校園長") === 0 ? principal : (principal ? "校園長名　" + principal : "");
    var people = doc.participants === "" || doc.participants == null ? "" : String(doc.participants) + "人";
    return '<article class="form-sheet">' +
      '<div class="form-sheet-top"><div><div class="form-mark">' + J.esc(formMark) + "</div><div>" + J.esc(formName) + "</div></div>" +
      '<div class="form-date">' + J.esc(J.warekiFromISO(doc.preparedOn)) + "</div></div>" +
      '<p class="form-org">守口市社会人等指導者人材バンク事業</p>' +
      "<h2>" + J.esc(doc.month) + "月　" + J.esc(kind) + "書</h2>" +
      '<p class="form-school">' + J.esc(school) + "</p>" +
      (principalText ? '<p class="form-school">' + J.esc(principalText) + "</p>" : "") +
      '<table class="form-fields"><tbody>' +
      (university ? "<tr><th>大学名</th><td colspan=\"5\">" + J.esc(doc.university || "") + "</td></tr>" : "") +
      "<tr><th>フリガナ</th><td colspan=\"3\">" + J.esc(doc.instructorKana || "") + "</td><th>登録番号</th><td>" + J.esc(doc.instructorId || "") + "</td></tr>" +
      "<tr><th>指導者氏名</th><td colspan=\"5\">" + J.esc(doc.instructorName || "") + "</td></tr>" +
      "<tr><th>" + J.esc(cat.fieldLabel) + "</th><td" + (cat.hasGrade ? "" : ' colspan="5"') + ">" + J.esc(doc.title || "") + "</td>" +
      (cat.hasGrade ? "<th>対象学年</th><td>" + J.esc(doc.grade || "") + "</td><th>参加人数</th><td>" + J.esc(people) + "</td>" : "") +
      "</tr><tr><th>活動内容</th><td colspan=\"5\">" + J.esc(doc.summary || "") + "</td></tr></tbody></table>" +
      '<p class="form-lead">令和' + J.esc(reiwaText) + "年" + J.esc(doc.month) + "月の活動内容を下記のとおり" + verb + "</p>" +
      '<table class="form-sessions"><thead><tr><th>回</th><th>日</th><th>曜日</th><th>時間</th><th>活動時間</th>' +
      "<th>休憩時間</th><th>活動内容</th></tr></thead><tbody>" + rows +
      '<tr class="form-total"><td colspan="4">' + totalLabel + '</td><td class="center">' + J.esc(totalValue) + '</td><td colspan="' + tailSpan + '">' + totalUnit + "</td></tr>" +
      "</tbody></table></article>";
  }

  function previewHtml() {
    var note = previewNote;
    previewNote = "";
    return '<div class="preview-tools no-print"><div class="toolbar">' +
      '<button type="button" class="btn btn-primary" data-action="write-submit">提出データ書き出し</button> ' +
      '<button type="button" class="btn" data-action="print-preview">帳票をPDFで保存</button> ' +
      '<button type="button" class="btn" data-action="close-preview">閉じる</button></div>' +
      '<p class="small">帳票を確認してから、提出データを書き出します。PDFは、保存の画面で PDF を選びます。</p>' +
      (note ? '<p class="alert ok" role="status">' + J.esc(note) + "</p>" : "") +
      "</div>" +
      '<div class="submit-preview">' + submitPreview.map(previewForm).join("") + "</div>";
  }

  function submitBundle() {
    var pool = submitPool();
    var chosen = pool.filter(function (d) { return pickedSubmit[d.id]; });
    if (!chosen.length) {
      alert("提出する計画・報告にチェックを入れてください。");
      return;
    }
    var problems = chosen.filter(function (doc) { return submitGaps(doc).length; }).map(gapText);
    if (problems.length) {
      alert("未入力があります。\n\n" + problems.join("\n\n"));
      return;
    }
    if (draft && document.getElementById("doc-form")) rememberDraft();
    chosen = state.documents.filter(function (d) { return pickedSubmit[d.id]; });
    openSubmitPreview(chosen, "");
  }

  function calendarEvents(docs, markPlan) {
    var events = [];
    docs.forEach(function (doc) {
      J.usableSessions(doc).forEach(function (session, index) {
        var summary = ((doc.title || "") + " " + (doc.instructorName || "")).trim();
        if (markPlan && doc.type === "plan") summary = "活用計画 " + summary;
        events.push({
          uid: doc.id + "-" + session.date + "-" + session.start + "-" + index + "@jinzai",
          date: session.date,
          start: session.start,
          end: session.end,
          summary: summary || "活動",
          description: session.content || ""
        });
      });
    });
    return events;
  }

  function exportIcs(scope) {
    var docs = scope === "manager" ? monthLoaded() : teacherMonthDocs();
    var events = calendarEvents(docs, true);
    if (!events.length) {
      alert("書き出せる予定がありません。");
      return;
    }
    var name = (scope === "manager" ? "学校の予定_" : "予定_") + fileSchoolName() + "_" + J.monthKey(filter.year, filter.month) + ".ics";
    J.download(name, J.calendarIcs(events), "text/calendar;charset=utf-8");
  }

  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    if (action === "role") {
      state.role = btn.getAttribute("data-role") === "manager" ? "manager" : "teacher";
      save();
      render();
    } else if (action === "tab") setTab(btn.getAttribute("data-tab"));
    else if (action === "new") newDoc(btn.getAttribute("data-type"));
    else if (action === "edit") {
      var found = state.documents.find(function (d) { return d.id === btn.getAttribute("data-id"); });
      if (!found) return;
      draft = JSON.parse(JSON.stringify(found));
      filter.year = Number(found.year);
      filter.month = Number(found.month);
      state.tab = "docs";
      render();
    } else if (action === "cancel-doc") {
      draft = null;
      render();
    }     else if (action === "save-doc") saveDoc();
    else if (action === "save-state") saveStateFile();
    else if (action === "next-month-plans") advanceToNextMonth();
    else if (action === "submit-person") submitPerson(btn.getAttribute("data-id"));
    else if (action === "submit-all") {
      listedDocs().forEach(function (doc) { pickedSubmit[doc.id] = true; });
      render();
    } else if (action === "submit-none") {
      listedDocs().forEach(function (doc) { delete pickedSubmit[doc.id]; });
      render();
    } else if (action === "submit-bundle") submitBundle();
    else if (action === "write-submit") {
      if (!submitPreview || !submitPreview.length) return;
      var exportProblems = submitPreview.filter(function (doc) { return submitGaps(doc).length; }).map(gapText);
      if (exportProblems.length) {
        alert("未入力があるため、書き出せません。\n\n" + exportProblems.join("\n\n"));
        return;
      }
      if (!downloadSubmit(submitPreview)) return;
      var both = submitPreview.some(function (doc) { return doc.type === "plan"; }) && submitPreview.some(function (doc) { return doc.type === "report"; });
      previewNote = both ? "計画と実績を、別々のファイルで書き出しました。" : "提出データを書き出しました。";
      save();
      render();
    } else if (action === "print-preview") {
      var printProblems = (submitPreview || []).filter(function (doc) { return submitGaps(doc).length; }).map(gapText);
      if (printProblems.length) {
        alert("未入力があるため、帳票を保存できません。\n\n" + printProblems.join("\n\n"));
        return;
      }
      window.print();
    }
    else if (action === "close-preview") {
      submitPreview = null;
      render();
    } else if (action === "export-ics") exportIcs(btn.getAttribute("data-scope"));
    else if (action === "add-session") {
      readForm();
      draft.sessions.push(J.blankSession());
      render();
    } else if (action === "remove-session") {
      readForm();
      draft.sessions.splice(Number(btn.getAttribute("data-index")), 1);
      if (!draft.sessions.length) draft.sessions.push(J.blankSession());
      render();
    } else if (action === "delete-doc") {
      if (!confirm("この書類を削除しますか。")) return;
      state.documents = state.documents.filter(function (d) { return d.id !== draft.id; });
      draft = null;
      save();
      render();
    } else if (action === "copy-report") {
      readForm();
      var errors = J.validateDocument(draft);
      if (errors.length) {
        alert("先に計画として残せる内容にしてください。\n" + errors.join("\n"));
        return;
      }
      var copy = JSON.parse(JSON.stringify(draft));
      copy.id = J.uid();
      copy.type = "report";
      copy.preparedOn = J.todayISO();
      copy.updatedAt = new Date().toISOString();
      draft = copy;
      render();
    } else if (action === "save-profile") {
      var picked = String(document.getElementById("profile-school").value || "").split("|");
      state.profile.schoolName = (picked[0] || "").trim();
      state.profile.schoolKind = picked[1] || "elementary";
      state.profile.schoolCode = J.schoolCodeOf({ code: picked[2] }) || J.schoolCodeOf(J.knownSchool(state.profile.schoolName)) || "";
      state.profile.principal = document.getElementById("profile-principal").value.trim();
      save();
      render();
    } else if (action === "review") {
      reviewMode = btn.getAttribute("data-mode") === "calendar" ? "calendar" : "list";
      render();
    } else if (action === "filter-type") {
      filter.type = btn.getAttribute("data-type") === "plan" || btn.getAttribute("data-type") === "report" ? btn.getAttribute("data-type") : "all";
      render();
    }
  });

  document.body.addEventListener("input", function (e) {
    if (e.target.id === "talent-query") {
      var q = String(e.target.value || "").trim();
      var shown = 0;
      document.querySelectorAll("#talent-rows tr").forEach(function (row) {
        var hit = !q || (row.getAttribute("data-text") || "").indexOf(q) >= 0;
        row.style.display = hit ? "" : "none";
        if (hit) shown += 1;
      });
      var empty = document.getElementById("talent-empty");
      if (empty) empty.hidden = shown > 0;
      return;
    }
    if (e.target.closest("#doc-form")) refreshComputed();
  });

  document.body.addEventListener("change", function (e) {
    if (e.target.id === "profile-school") {
      var pickedSchool = String(e.target.value || "").split("|");
      state.profile.schoolName = (pickedSchool[0] || "").trim();
      state.profile.schoolKind = pickedSchool[1] || state.profile.schoolKind || "elementary";
      var pickedCode = J.schoolCodeOf({ code: pickedSchool[2] }) || J.schoolCodeOf(J.knownSchool(state.profile.schoolName));
      state.profile.schoolCode = pickedCode || "";
      var codeField = document.getElementById("profile-school-code");
      if (codeField) codeField.value = pickedCode || "";
      save();
      caption();
      return;
    }
    if (e.target.name === "filterYear" || e.target.name === "filterMonth" || e.target.name === "filterType") {
      var nextYear = e.target.name === "filterYear" ? Number(e.target.value) : filter.year;
      var nextMonth = e.target.name === "filterMonth" ? Number(e.target.value) : filter.month;
      if (nextYear !== Number(filter.year) || nextMonth !== Number(filter.month)) closeUnsavedForMonth(nextYear, nextMonth);
      if (e.target.name === "filterYear") filter.year = nextYear;
      if (e.target.name === "filterMonth") filter.month = nextMonth;
      if (e.target.name === "filterType") filter.type = e.target.value;
      render();
      return;
    }
    if (e.target.name === "category" || e.target.name === "year" || e.target.name === "month") {
      readForm();
      render();
      return;
    }
    if (e.target.getAttribute("data-submit-pick")) {
      pickedSubmit[e.target.getAttribute("data-submit-pick")] = e.target.checked;
      return;
    }
    if (e.target.id === "work-folder") {
      openWorkFolder(e.target.files);
      e.target.value = "";
      return;
    }
    if ((e.target.id === "work-file" || e.target.id === "work-file-add") && e.target.files[0]) {
      var work = e.target.files[0];
      var workMode = e.target.id === "work-file-add" ? "add" : "replace";
      var workReader = new FileReader();
      workReader.onload = function () {
        var parsed = J.payloadFromFile(work.name, new Uint8Array(workReader.result));
        if (!parsed || parsed.error) {
          alert(parsed && parsed.error ? parsed.error : "ファイルを読み取れませんでした。");
          return;
        }
        if (workMode === "add") addWorkFile(parsed);
        else openWorkFile(parsed);
      };
      workReader.readAsArrayBuffer(work);
      e.target.value = "";
      return;
    }
    if (e.target.id === "talent-file" && e.target.files[0]) {
      var talentFile = e.target.files[0];
      var talentReader = new FileReader();
      talentReader.onload = function () {
        try {
          var json = JSON.parse(talentReader.result);
          if (!json || json.schema !== J.SCHEMA_ROSTER || !Array.isArray(json.instructors)) {
            alert("指導者リストのファイルではありません。教育センターの「指導者・口座」から書き出したファイルを選んでください。");
            return;
          }
          state.profile.roster = json.instructors.map(talentPerson).filter(function (p) { return p.id || p.name; });
          save();
          state.tab = "talent";
          render();
        } catch (err) {
          alert("ファイルを読み取れませんでした。");
        }
      };
      talentReader.readAsText(talentFile, "utf-8");
      e.target.value = "";
    }
  });

  var schoolCodeBefore = J.schoolCodeOf({ code: state.profile.schoolCode });
  var schoolNameBefore = state.profile.schoolName;
  applyKnownSchool();
  if (state.profile.schoolName !== schoolNameBefore || J.schoolCodeOf({ code: state.profile.schoolCode }) !== schoolCodeBefore) save();
  render();
})();
