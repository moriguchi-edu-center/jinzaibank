(function () {
  "use strict";
  var J = window.Jinzai;
  var items = [];
  var notes = [];
  var pickedMonths = {};
  var pickedIds = {};
  var pickedTypes = { plan: true, report: true };

  function esc(value) {
    return J.esc(value);
  }

  function kindOf(name) {
    var text = String(name || "");
    if (text.indexOf("こども園") >= 0) return "kodomo";
    if (text.indexOf("中学校") >= 0) return "junior";
    if (text.indexOf("小学校") >= 0) return "elementary";
    if (text.indexOf("学園") >= 0) return "compulsory";
    return "";
  }

  function safeFilePart(value) {
    return String(value || "").trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "") || "学校";
  }

  function amount(doc) {
    var cat = J.categoryOf(doc.category);
    if (!cat) return "";
    return cat.unit === "count" ? J.documentCount(doc) + "回" : J.formatMinutes(J.documentMinutes(doc));
  }

  function checkedCopy(doc) {
    return {
      type: doc.type,
      category: doc.category,
      year: doc.year,
      month: doc.month,
      instructorId: doc.instructorId,
      instructorName: doc.instructorName,
      title: doc.title,
      sessions: doc.sessions && doc.sessions.length ? doc.sessions : [J.blankSession()]
    };
  }

  function blockers(doc) {
    return J.documentBlockers(checkedCopy(doc));
  }

  function rowIssues(doc) {
    return J.validateDocument(checkedCopy(doc)).filter(function (message) {
      return /^\d+行目/.test(message);
    });
  }

  function docMonthKey(doc) {
    if (!doc.year || !doc.month) return "none";
    return J.monthKey(doc.year, doc.month);
  }

  function monthLabel(key) {
    if (key === "none") return "年月不明";
    var parts = String(key).split("-");
    return Number(parts[0]) + "年" + Number(parts[1]) + "月";
  }

  function monthKeys() {
    var map = {};
    items.forEach(function (doc) { map[docMonthKey(doc)] = true; });
    return Object.keys(map).sort(function (a, b) {
      if (a === "none") return 1;
      if (b === "none") return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  function visibleDocs() {
    return items.filter(function (doc) {
      var type = doc.type === "report" ? "report" : "plan";
      return pickedMonths[docMonthKey(doc)] && pickedTypes[type];
    });
  }

  function exportDocs() {
    return visibleDocs().filter(function (doc) { return pickedIds[doc.id] && !blockers(doc).length; });
  }

  function applyMonthDefaults() {
    items.forEach(function (doc) {
      if (blockers(doc).length) {
        pickedIds[doc.id] = false;
        return;
      }
      if (pickedMonths[docMonthKey(doc)] && pickedIds[doc.id] == null) pickedIds[doc.id] = true;
    });
  }

  function useMonths(keys) {
    pickedMonths = {};
    monthKeys().forEach(function (key) { pickedMonths[key] = false; });
    keys.forEach(function (key) { pickedMonths[key] = true; });
    applyMonthDefaults();
    render();
  }

  function resetPicks() {
    pickedIds = {};
    var keys = monthKeys();
    var dated = keys.filter(function (key) { return key !== "none"; });
    var latest = dated.length ? dated[dated.length - 1] : (keys[0] || "");
    pickedMonths = {};
    keys.forEach(function (key) { pickedMonths[key] = key === latest; });
    applyMonthDefaults();
  }

  function render() {
    var app = document.getElementById("app");
    if (!items.length && !notes.length) {
      app.innerHTML = "";
      return;
    }
    var keys = monthKeys();
    var shown = visibleDocs();
    var chosen = exportDocs();
    var monthBoxes = keys.map(function (key) {
      return '<label><input class="month-pick" type="checkbox" value="' + esc(key) + '"' +
        (pickedMonths[key] ? " checked" : "") + ">" + esc(monthLabel(key)) + "</label>";
    }).join("");
    var readyShown = shown.filter(function (doc) { return !blockers(doc).length; });
    var readyOn = readyShown.filter(function (doc) { return pickedIds[doc.id]; }).length;
    var rows = shown.map(function (doc) {
      var errors = blockers(doc);
      var gaps = rowIssues(doc);
      var canExport = !errors.length;
      var state = !canExport ? "見送り（" + errors[0] + "）" : (gaps.length ? "不完全な行も読み込みました" : "提出できる");
      return "<tr><td><input class=\"row-pick\" type=\"checkbox\" value=\"" + esc(doc.id) + "\"" +
        (canExport && pickedIds[doc.id] ? " checked" : "") + (canExport ? "" : " disabled") + "></td><td>" +
        esc(doc.sourceName || "") + "</td><td>" + esc(doc.sheetName || "") + "</td><td>" +
        esc(doc.schoolName || "") + "</td><td>" + esc(monthLabel(docMonthKey(doc))) + "</td><td>" +
        (doc.type === "report" ? "実績報告" : "活用計画") + "</td><td>" + esc(doc.instructorId || "") + "</td><td>" +
        esc(doc.instructorName || "") + "</td><td>" + esc(doc.title || "") + "</td><td>" + esc(amount(doc)) + "</td><td>" +
        esc(state) + "</td></tr>";
    }).join("");
    app.innerHTML = '<section class="panel"><h2>読み込んだ内容</h2>' +
      '<p class="lead">取り込む年月と、活用計画・実績報告を選ぶと、その分だけが一覧に出ます。書き出す行は左のチェックで選びます。選んだ行だけを、学校・年月・計画と報告ごとにExcelへ書き出します。</p>' +
      '<h3>取り込む年月</h3>' +
      '<div class="checks">' + monthBoxes + "</div>" +
      '<div class="toolbar"><button type="button" class="btn" id="months-all">すべての年月</button>' +
      '<button type="button" class="btn" id="months-none">年月の選択を外す</button></div>' +
      '<h3>種類</h3>' +
      '<div class="checks">' +
      '<label><input class="type-pick" type="checkbox" value="plan"' + (pickedTypes.plan ? " checked" : "") + ">活用計画</label>" +
      '<label><input class="type-pick" type="checkbox" value="report"' + (pickedTypes.report ? " checked" : "") + ">実績報告</label>" +
      "</div>" +
      '<p class="small">表示 ' + shown.length + "件　書き出す " + chosen.length + "件</p>" +
      '<div class="table-wrap"><table class="data"><thead><tr><th><input id="pick-visible" type="checkbox" title="表示中を選ぶ"' +
      (readyShown.length && readyOn === readyShown.length ? " checked" : "") + '></th><th>ファイル</th><th>シート</th><th>学校</th><th>年月</th><th>種類</th><th>登録番号</th><th>指導者</th><th>教科・クラブ等</th><th>合計</th><th>状態</th></tr></thead><tbody>' +
      (rows || "<tr><td colspan=\"11\">選んだ年月の計画・報告はありません。</td></tr>") +
      "</tbody></table></div>" +
      '<div class="toolbar"><button type="button" class="btn btn-primary" id="export-legacy"' + (chosen.length ? "" : " disabled") + ">選択したものを書き出す（" + chosen.length + "件）</button> " +
      '<button type="button" class="btn" id="clear-legacy">読み込んだ内容を消す</button></div>' +
      (notes.length ? "<h3>ひな形との違い</h3><ul>" + notes.map(function (line) { return "<li>" + esc(line) + "</li>"; }).join("") + "</ul>" : "") +
      "</section>";
    var head = document.getElementById("pick-visible");
    if (head) head.indeterminate = readyOn > 0 && readyOn < readyShown.length;
  }

  function setStatus(text) {
    var el = document.getElementById("legacy-status");
    if (el) el.textContent = text || "";
  }

  function isWorkbook(file) {
    return file && file.name && !/^~\$/.test(file.name) && /\.(xlsx|xlsm|xls|xlsb)$/i.test(file.name);
  }

  function fileLabel(file) {
    return file.webkitRelativePath || file.name;
  }

  function addFolder(fileList) {
    var all = Array.prototype.slice.call(fileList || []);
    var files = all.filter(isWorkbook).sort(function (a, b) {
      return fileLabel(a).localeCompare(fileLabel(b), "ja");
    });
    if (!all.length) return;
    if (!files.length) {
      alert("フォルダの中に計画・報告書のエクセルがありません。");
      return;
    }
    items = [];
    notes = [];
    pickedMonths = {};
    pickedIds = {};
    render();
    var others = all.length - files.length;
    setStatus("エクセル " + files.length + "件を読み込んでいます。" + (others ? " エクセル以外のファイルは読み込んでいません。" : ""));
    var pending = files.length;
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = J.formsFromExcel(new Uint8Array(reader.result));
          if (parsed.error && !(parsed.documents && parsed.documents.length)) notes.push(fileLabel(file) + "：" + parsed.error);
          (parsed.documents || []).forEach(function (doc) {
            doc.sourceName = fileLabel(file);
            doc.id = J.uid();
            doc.updatedAt = new Date().toISOString();
            items.push(doc);
          });
          (parsed.warnings || []).forEach(function (warning) { notes.push(fileLabel(file) + "：" + warning); });
        } catch (err) {
          notes.push(fileLabel(file) + "：読み込めませんでした。");
        }
        pending -= 1;
        if (!pending) finishFolder(files.length, others);
      };
      reader.onerror = function () {
        notes.push(fileLabel(file) + "：読み取れませんでした。");
        pending -= 1;
        if (!pending) finishFolder(files.length, others);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function finishFolder(fileCount, others) {
    resetPicks();
    var dated = monthKeys().filter(function (key) { return key !== "none"; });
    var span = dated.length ? monthLabel(dated[0]) + (dated.length > 1 ? "から" + monthLabel(dated[dated.length - 1]) : "") : "";
    setStatus("エクセル " + fileCount + "件を読みました。" + (span ? " フォルダの中には" + span + "があります。" : "") + (others ? " エクセル以外のファイルは読み込んでいません。" : ""));
    render();
  }

  function submissionDoc(doc) {
    return {
      id: doc.id,
      type: doc.type,
      category: doc.category,
      year: Number(doc.year),
      month: Number(doc.month),
      preparedOn: doc.preparedOn || "",
      principal: doc.principal || "",
      instructorId: doc.instructorId,
      instructorKana: doc.instructorKana || "",
      instructorName: doc.instructorName,
      university: doc.university || "",
      title: doc.title,
      grade: doc.grade || "",
      participants: doc.participants === "" || doc.participants == null ? "" : doc.participants,
      summary: doc.summary || "",
      sessions: doc.sessions || [],
      updatedAt: doc.updatedAt
    };
  }

  function exportFiles() {
    var groups = {};
    exportDocs().forEach(function (doc) {
      var school = doc.schoolName || "学校未設定";
      var key = [school, doc.year, doc.month, doc.type].join("|");
      if (!groups[key]) {
        groups[key] = {
          school: school,
          kind: kindOf(school),
          principal: doc.principal || "",
          year: doc.year,
          month: doc.month,
          type: doc.type,
          documents: []
        };
      }
      if (!groups[key].principal && doc.principal) groups[key].principal = doc.principal;
      groups[key].documents.push(submissionDoc(doc));
    });
    var keys = Object.keys(groups);
    if (!keys.length) {
      alert("書き出せる計画・報告がありません。");
      return;
    }
    keys.forEach(function (key, index) {
      var group = groups[key];
      var label = group.type === "report" ? "実績報告" : "活用計画";
      var name = label + "_" + safeFilePart(group.school) + "_" + J.monthKey(group.year, group.month) + ".xlsx";
      setTimeout(function () {
        J.downloadExcel(name, J.handoffWorkbook({
          handoff: group.type,
          savedAt: new Date().toISOString(),
          period: J.monthKey(group.year, group.month),
          school: { name: group.school, kind: group.kind, principal: group.principal },
          documents: group.documents
        }));
      }, index * 400);
    });
  }

  var folderInput = document.getElementById("legacy-folder");
  if (folderInput) folderInput.addEventListener("change", function (e) {
    addFolder(e.target.files);
    e.target.value = "";
  });

  document.body.addEventListener("click", function (e) {
    if (e.target.id === "export-legacy") exportFiles();
    if (e.target.id === "months-all") useMonths(monthKeys());
    if (e.target.id === "months-none") useMonths([]);
    if (e.target.id === "clear-legacy") {
      items = [];
      notes = [];
      pickedMonths = {};
      pickedIds = {};
      pickedTypes = { plan: true, report: true };
      setStatus("");
      render();
    }
  });

  document.body.addEventListener("change", function (e) {
    if (e.target.classList && e.target.classList.contains("month-pick")) {
      pickedMonths[e.target.value] = e.target.checked;
      applyMonthDefaults();
      render();
      return;
    }
    if (e.target.classList && e.target.classList.contains("type-pick")) {
      pickedTypes[e.target.value] = e.target.checked;
      render();
      return;
    }
    if (e.target.classList && e.target.classList.contains("row-pick")) {
      pickedIds[e.target.value] = e.target.checked;
      render();
      return;
    }
    if (e.target.id === "pick-visible") {
      var on = e.target.checked;
      visibleDocs().forEach(function (doc) {
        if (!blockers(doc).length) pickedIds[doc.id] = on;
      });
      render();
    }
  });
})();
