(() => {
  const config = window.FASTAI_SUPABASE || {};
  const authPanel = document.getElementById("authPanel");
  const authMessage = document.getElementById("authMessage");
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const workspace = document.querySelector(".workspace");
  const signOutBtn = document.getElementById("signOutBtn");
  const saveStatus = document.getElementById("saveStatus");
  const retrySaveBtn = document.getElementById("retrySaveBtn");
  const importLegacyBtn = document.getElementById("importLegacyBtn");
  const legacyDialog = document.getElementById("legacyDialog");
  const legacySourceSelect = document.getElementById("legacySourceSelect");
  const legacyMessage = document.getElementById("legacyMessage");
  const confirmLegacyBtn = document.getElementById("confirmLegacyBtn");
  const noteArea = document.getElementById("noteArea");
  const conceptCard = document.getElementById("conceptCard");
  const cardTitle = document.getElementById("cardTitle");
  const cardView = document.getElementById("cardView");
  const cardEditor = document.getElementById("cardEditor");
  const pathTrail = document.getElementById("pathTrail");

  const editNotesBtn = document.getElementById("editNotesBtn");
  const saveNotesBtn = document.getElementById("saveNotesBtn");
  const createCardBtn = document.getElementById("createCardBtn");
  const backBtn = document.getElementById("backBtn");
  const closeBtn = document.getElementById("closeBtn");
  const editCardBtn = document.getElementById("editCardBtn");
  const deleteCardBtn = document.getElementById("deleteCardBtn");
  const saveCardBtn = document.getElementById("saveCardBtn");
  const cancelCardBtn = document.getElementById("cancelCardBtn");
  const cardTextInput = document.getElementById("cardTextInput");
  const shortcutSettingsBtn = document.getElementById("shortcutSettingsBtn");
  const shortcutDialog = document.getElementById("shortcutDialog");
  const closeShortcutDialogBtn = document.getElementById("closeShortcutDialogBtn");
  const cancelShortcutsBtn = document.getElementById("cancelShortcutsBtn");
  const saveShortcutsBtn = document.getElementById("saveShortcutsBtn");
  const resetShortcutsBtn = document.getElementById("resetShortcutsBtn");
  const saveShortcutInput = document.getElementById("saveShortcutInput");
  const createShortcutInput = document.getElementById("createShortcutInput");
  const saveShortcutHint = document.getElementById("saveShortcutHint");
  const createShortcutHint = document.getElementById("createShortcutHint");
  const shortcutMessage = document.getElementById("shortcutMessage");
  const editShortcutInput = document.getElementById("editShortcutInput");
  const editShortcutHint = document.getElementById("editShortcutHint");

  const defaultShortcuts = {
    edit: { code: "KeyD", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
    save: { code: "KeyS", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
    create: { code: "KeyA", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }
  };

  let concepts = {};
  let historyStack = [];
  let currentConceptKey = null;
  let notesEditing = false;
  let shortcuts = JSON.parse(JSON.stringify(defaultShortcuts));
  let pendingShortcuts = JSON.parse(JSON.stringify(defaultShortcuts));
  let autosaveTimer = null;
  let client = null;
  let signedInUser = null;
  let revision = null;
  let changeVersion = 0;
  let savedVersion = 0;
  let savePromise = null;
  let saveBlocked = false;
  let legacyDrafts = [];

  function escapeHtml(value) {
    const temporaryElement = document.createElement("div");
    temporaryElement.textContent = value ?? "";
    return temporaryElement.innerHTML;
  }

  function slugify(value) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function conceptKeyFromTitle(title) {
    const normalizedTitle = title.trim().toLowerCase();
    return Object.keys(concepts).find(
      key => concepts[key].title.toLowerCase() === normalizedTitle
    ) || null;
  }

  function snapshotState() {
    const noteClone = noteArea.cloneNode(true);
    const walker = document.createTreeWalker(noteClone, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      walker.currentNode.textContent = walker.currentNode.textContent.replace(/\u200B/g, "");
    }
    return {
      note_html: noteClone.innerHTML,
      concepts: structuredClone(concepts),
      shortcuts: structuredClone(shortcuts)
    };
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => { void saveState().catch(() => {}); }, 700);
  }

  function markDirty() {
    changeVersion += 1;
    saveStatus.textContent = "Unsaved changes";
    retrySaveBtn.hidden = true;
    scheduleAutosave();
  }

  async function saveState() {
    clearTimeout(autosaveTimer);
    if (!client || !signedInUser || savedVersion === changeVersion) return;
    if (saveBlocked) throw new Error("This document changed on another device. Reload to see that version; your unsaved changes remain here until then.");
    if (savePromise) return savePromise;

    savePromise = (async () => {
      while (savedVersion < changeVersion) {
        const savingVersion = changeVersion;
        const state = snapshotState();
        saveStatus.textContent = "Saving…";
        let result;

        if (revision === null) {
          result = await client.from("notes").insert({
            user_id: signedInUser.id,
            ...state,
            revision: 1,
            updated_at: new Date().toISOString()
          }).select("revision").single();
        } else {
          result = await client.from("notes").update({
            ...state,
            revision: revision + 1,
            updated_at: new Date().toISOString()
          }).eq("user_id", signedInUser.id).eq("revision", revision)
            .select("revision").maybeSingle();
        }

        if (result.error) throw result.error;
        if (!result.data) {
          saveBlocked = true;
          throw new Error("This document changed on another device. Your edits were not overwritten. Copy any unsaved changes before reloading.");
        }
        revision = result.data.revision;
        importLegacyBtn.hidden = true;
        savedVersion = savingVersion;
      }
      saveStatus.textContent = "Saved online";
      retrySaveBtn.hidden = true;
    })().catch(error => {
      saveStatus.textContent = `Not saved online: ${error.message}`;
      retrySaveBtn.hidden = saveBlocked;
      throw error;
    }).finally(() => { savePromise = null; });
    return savePromise;
  }

  async function loadState() {
    const { data, error } = await client.from("notes")
      .select("note_html, concepts, shortcuts, revision")
      .eq("user_id", signedInUser.id).maybeSingle();
    if (error) throw error;

    noteArea.innerHTML = data?.note_html || "";
    concepts = data?.concepts || {};
    shortcuts = {
      edit: data?.shortcuts?.edit || defaultShortcuts.edit,
      save: data?.shortcuts?.save || defaultShortcuts.save,
      create: data?.shortcuts?.create || defaultShortcuts.create
    };
    revision = data?.revision ?? null;
    changeVersion = 0;
    savedVersion = 0;
    saveBlocked = false;
    saveStatus.textContent = "Loaded from online storage";
  }

  function findLegacyDrafts() {
    const keys = [
      ["Old local editor", "oskuddar-fastai-freeform-v3"],
      ["Old public-site draft", "oskuddar-fastai-freeform-v3-public-draft"]
    ];
    return keys.flatMap(([label, key]) => {
      try {
        const raw = localStorage.getItem(key); // Read-only, for one-time migration.
        if (!raw) return [];
        const state = JSON.parse(raw);
        if (!state.noteHtml && !Object.keys(state.concepts || {}).length) return [];
        return [{ label, state }];
      } catch (_) {
        return [];
      }
    });
  }

  function prepareLoadedNotes() {
    normalizeTermBoundaries(noteArea);
    convertLinkSyntax(noteArea);
    attachConceptClicks(noteArea);
    updateShortcutLabels();
  }

  function shortcutKeyName(code) {
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    return code.replace("Arrow", "");
  }

  function shortcutLabel(binding, compact = false) {
    const parts = [];
    if (binding.ctrlKey) parts.push(compact ? "⌃" : "Control");
    if (binding.altKey) parts.push(compact ? "⌥" : "Option");
    if (binding.shiftKey) parts.push(compact ? "⇧" : "Shift");
    if (binding.metaKey) parts.push(compact ? "⌘" : "Command");
    parts.push(shortcutKeyName(binding.code));
    return parts.join(compact ? " " : " + ");
  }

  function updateShortcutLabels(bindings = shortcuts) {
    editShortcutInput.textContent = shortcutLabel(bindings.edit);
    saveShortcutInput.textContent = shortcutLabel(bindings.save);
    createShortcutInput.textContent = shortcutLabel(bindings.create);
    editShortcutHint.textContent = shortcutLabel(bindings.edit, true);
    saveShortcutHint.textContent = shortcutLabel(bindings.save, true);
    createShortcutHint.textContent = shortcutLabel(bindings.create, true);
  }

  function shortcutMatches(event, binding) {
    return event.code === binding.code &&
      event.altKey === binding.altKey &&
      event.ctrlKey === binding.ctrlKey &&
      event.metaKey === binding.metaKey &&
      event.shiftKey === binding.shiftKey;
  }

  function recordShortcut(event, action) {
    if (["Alt", "Control", "Meta", "Shift"].includes(event.key)) return;

    event.preventDefault();
    event.stopPropagation();

    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
      shortcutMessage.textContent = "Include Option, Control, or Command in the shortcut.";
      return;
    }

    pendingShortcuts[action] = {
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey
    };
    shortcutMessage.textContent = "";
    updateShortcutLabels(pendingShortcuts);
  }

  function openShortcutDialog() {
    pendingShortcuts = JSON.parse(JSON.stringify(shortcuts));
    shortcutMessage.textContent = "";
    updateShortcutLabels(pendingShortcuts);
    shortcutDialog.showModal();
  }

  function saveShortcutSettings() {
    const labels = ["edit", "save", "create"].map(action =>
      shortcutLabel(pendingShortcuts[action])
    );
    if (new Set(labels).size !== labels.length) {
      shortcutMessage.textContent = "Edit, Save, and Create need different shortcuts.";
      return;
    }

    shortcuts = JSON.parse(JSON.stringify(pendingShortcuts));
    updateShortcutLabels();
    markDirty();
    shortcutDialog.close();
  }

  function renderCardText(rawText) {
    const escapedText = escapeHtml(rawText || "");

    const linkedText = escapedText.replace(/\[\[([^\]]+)\]\]/g, (wholeMatch, title) => {
      const key = conceptKeyFromTitle(title);
      if (!key) return escapeHtml(title);

      return `<span class="inline-card-link" data-concept="${escapeHtml(key)}">${escapeHtml(concepts[key].title)}</span>`;
    });

    return linkedText.replace(/\n/g, "<br>");
  }

  function createExternalLink(url) {
    const link = document.createElement("a");
    link.className = "external-link";
    link.href = url;
    link.dataset.url = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = url;
    link.textContent = "[link]";
    return link;
  }

  function flattenPastedMarkdownLinks(rootElement) {
    rootElement.querySelectorAll("a[href]:not(.external-link)").forEach(link => {
      const previousNode = link.previousSibling;
      const nextNode = link.nextSibling;
      const previousText = previousNode?.nodeType === Node.TEXT_NODE
        ? previousNode.textContent
        : "";
      const nextText = nextNode?.nodeType === Node.TEXT_NODE
        ? nextNode.textContent
        : "";
      const hasOpeningSyntax = /(?:!!|!\\!)\[$/.test(previousText);
      const hasClosingSyntax = /^\]\(https?:\/\/[^)]+\)!!/.test(nextText);

      if (hasOpeningSyntax && hasClosingSyntax) {
        link.replaceWith(document.createTextNode(link.textContent));
        return;
      }

      // Browsers can automatically turn a pasted URL into an anchor, leaving
      // the !! markers in adjacent text nodes. Convert that DOM shape directly.
      const openingMatch = previousText.match(/(?:!!|!\\!)$/);
      const closingMatch = nextText.match(/^!!/);
      const url = link.href;
      if (openingMatch && closingMatch && /^https?:\/\//i.test(url)) {
        previousNode.textContent = previousText.slice(0, -openingMatch[0].length);
        nextNode.textContent = nextText.slice(closingMatch[0].length);
        link.replaceWith(createExternalLink(url));
      }
    });
    rootElement.normalize();
  }

  function convertLinkSyntax(rootElement) {
    flattenPastedMarkdownLinks(rootElement);
    const units = Array.from(rootElement.childNodes);

    units.forEach(unit => {
      const textNodes = [];
      if (unit.nodeType === Node.TEXT_NODE) {
        textNodes.push(unit);
      } else if (unit.nodeType === Node.ELEMENT_NODE) {
        const walker = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) textNodes.push(walker.currentNode);
      }

      let text = "";
      const positions = textNodes.map(node => {
        const value = node.textContent || "";
        const start = text.length;
        const excluded = node.parentElement?.closest("a, .term");
        text += excluded ? "\u0000".repeat(value.length) : value;
        return { node, start, end: text.length };
      });

      const linkPattern = /(?:!!|!\\!)(?:\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^!\s]+))!!/g;
      let match;
      const matches = [];
      while ((match = linkPattern.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: linkPattern.lastIndex,
          url: match[1] || match[2]
        });
      }

      matches.reverse().forEach(found => {
        const startPosition = positions.find(position =>
          found.start >= position.start && found.start < position.end
        );
        const endPosition = positions.find(position =>
          found.end > position.start && found.end <= position.end
        );
        if (!startPosition || !endPosition) return;

        const range = document.createRange();
        range.setStart(startPosition.node, found.start - startPosition.start);
        range.setEnd(endPosition.node, found.end - endPosition.start);
        range.deleteContents();
        range.insertNode(createExternalLink(found.url));
      });
    });
    rootElement.normalize();
  }

  function restoreLinkSyntax(rootElement) {
    rootElement.querySelectorAll("a.external-link[data-url]").forEach(link => {
      link.replaceWith(document.createTextNode(`!!${link.dataset.url}!!`));
    });
  }

  function normalizeTermBoundaries(rootElement) {
    rootElement.querySelectorAll(".term[data-concept]").forEach(term => {
      const concept = concepts[term.dataset.concept];
      if (!concept) return;

      const actualText = term.textContent || "";
      const expectedText = concept.title;
      if (actualText === expectedText) return;

      const expectedLength = expectedText.length;
      const prefix = actualText.slice(0, expectedLength);
      const suffix = actualText.slice(-expectedLength);

      if (prefix.toLowerCase() === expectedText.toLowerCase()) {
        const extraText = actualText.slice(expectedLength);
        term.textContent = prefix;
        if (extraText) term.after(document.createTextNode(extraText));
      } else if (suffix.toLowerCase() === expectedText.toLowerCase()) {
        const extraText = actualText.slice(0, -expectedLength);
        term.textContent = suffix;
        if (extraText) term.before(document.createTextNode(extraText));
      }
    });
  }

  function moveCaretOutsideTermBoundary() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const caretElement = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    const term = caretElement?.closest(".term");
    if (!term || !noteArea.contains(term)) return;

    const textBeforeCaret = document.createRange();
    textBeforeCaret.selectNodeContents(term);
    textBeforeCaret.setEnd(range.startContainer, range.startOffset);

    const textAfterCaret = document.createRange();
    textAfterCaret.selectNodeContents(term);
    textAfterCaret.setStart(range.startContainer, range.startOffset);

    let marker;
    if (textAfterCaret.toString() === "") {
      marker = document.createTextNode("\u200B");
      term.after(marker);
    } else if (textBeforeCaret.toString() === "") {
      marker = document.createTextNode("\u200B");
      term.before(marker);
    } else {
      return;
    }

    range.setStart(marker, marker.textContent.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function removeEditorMarkers(rootElement) {
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(textNode => {
      textNode.textContent = textNode.textContent.replace(/\u200B/g, "");
    });
    rootElement.normalize();
  }

  function insertPlainLineBreak() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!noteArea.contains(range.commonAncestorContainer)) return;

    range.deleteContents();

    const marker = document.createTextNode("\u200B");
    range.insertNode(marker);

    const block = marker.parentElement?.closest(
      "p, div, li, blockquote, h1, h2, h3, h4, h5, h6"
    ) || noteArea;

    while (marker.parentNode && marker.parentNode !== block) {
      const inlineParent = marker.parentNode;
      const rightSide = inlineParent.cloneNode(false);

      while (marker.nextSibling) rightSide.appendChild(marker.nextSibling);
      inlineParent.after(marker);
      if (rightSide.hasChildNodes()) marker.after(rightSide);
    }

    let trailingNode = marker.nextSibling;
    while (trailingNode) {
      const nextNode = trailingNode.nextSibling;
      const visibleText = (trailingNode.textContent || "")
        .replace(/\u200B/g, "")
        .trim();
      const containsMedia = trailingNode.nodeType === Node.ELEMENT_NODE &&
        trailingNode.querySelector("img, video, audio, iframe");

      if (visibleText || containsMedia) break;
      trailingNode.remove();
      trailingNode = nextNode;
    }

    if (block !== noteArea && !marker.nextSibling) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      textNodes.forEach(textNode => {
        if (textNode !== marker) {
          textNode.textContent = textNode.textContent.replace(/\u200B/g, "");
        }
      });

      const plainLine = document.createElement("div");
      plainLine.className = "note-line";
      plainLine.appendChild(marker);
      block.after(plainLine);
    } else {
      marker.before(document.createElement("br"));
    }

    range.setStart(marker, marker.textContent.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function attachConceptClicks(rootElement) {
    rootElement.querySelectorAll(".term, .inline-card-link").forEach(termElement => {
      termElement.onclick = event => {
        event.stopPropagation();
        renderConcept(termElement.dataset.concept, true);
      };
    });
  }

  function closeCard() {
    if (!cardEditor.hidden && currentConceptKey &&
        cardTextInput.value !== (concepts[currentConceptKey]?.text || "")) {
      saveStatus.textContent = "Save or cancel your card changes first.";
      return;
    }
    conceptCard.classList.remove("open");
    historyStack = [];
    currentConceptKey = null;
    pathTrail.replaceChildren();
  }

  function renderPath() {
    pathTrail.replaceChildren();

    const fullPath = [...historyStack, ...(currentConceptKey ? [currentConceptKey] : [])];
    if (!fullPath.length) return;

    const prefix = document.createElement("span");
    prefix.textContent = "Path: ";
    pathTrail.appendChild(prefix);

    fullPath.forEach((key, index) => {
      const concept = concepts[key];
      if (!concept) return;

      const pathLink = document.createElement("span");
      pathLink.className = "path-link";
      pathLink.textContent = concept.title;

      pathLink.addEventListener("click", () => {
        historyStack = fullPath.slice(0, index);
        renderConcept(key, false);
      });

      pathTrail.appendChild(pathLink);

      if (index < fullPath.length - 1) {
        const separator = document.createElement("span");
        separator.className = "path-separator";
        separator.textContent = "→";
        pathTrail.appendChild(separator);
      }
    });
  }

  function renderConcept(conceptKey, pushHistory = true) {
    if (!cardEditor.hidden && currentConceptKey &&
        cardTextInput.value !== (concepts[currentConceptKey]?.text || "")) {
      saveStatus.textContent = "Save or cancel your card changes first.";
      return;
    }
    const concept = concepts[conceptKey];
    if (!concept) return;

    if (pushHistory && currentConceptKey && currentConceptKey !== conceptKey) {
      historyStack.push(currentConceptKey);
    }

    currentConceptKey = conceptKey;
    cardTitle.textContent = concept.title;
    cardView.innerHTML = renderCardText(concept.text || "");

    cardView.hidden = false;
    cardEditor.hidden = true;
    editCardBtn.hidden = !signedInUser;
    deleteCardBtn.hidden = !signedInUser;
    conceptCard.classList.add("open");
    backBtn.disabled = historyStack.length === 0;

    renderPath();
    attachConceptClicks(cardView);
  }

  function startCardEditing() {
    if (!signedInUser) return;
    if (!currentConceptKey || !concepts[currentConceptKey]) return;
    cardTextInput.value = concepts[currentConceptKey].text || "";
    cardView.hidden = true;
    cardEditor.hidden = false;
    editCardBtn.hidden = true;
    deleteCardBtn.hidden = true;
    cardTextInput.focus();
  }

  async function saveCurrentCard() {
    if (!currentConceptKey || !concepts[currentConceptKey]) return;
    concepts[currentConceptKey].text = cardTextInput.value;
    markDirty();
    try {
      await saveState();
      renderConcept(currentConceptKey, false);
    } catch (_) {
      // Keep the editor open so the unsaved text is visible.
    }
  }

  function unlinkConceptEverywhere(conceptKey) {
    noteArea.querySelectorAll("[data-concept]").forEach(element => {
      if (element.dataset.concept === conceptKey) {
        element.replaceWith(document.createTextNode(element.textContent));
      }
    });
  }

  function deleteCurrentCard() {
    if (!signedInUser) return;
    if (!currentConceptKey || !concepts[currentConceptKey]) return;

    const deletedKey = currentConceptKey;
    unlinkConceptEverywhere(deletedKey);
    delete concepts[deletedKey];

    historyStack = historyStack.filter(key => key !== deletedKey);
    currentConceptKey = null;

    markDirty();
    closeCard();
    attachConceptClicks(noteArea);
  }

  function enterNotesEditing() {
    if (!signedInUser) return;
    normalizeTermBoundaries(noteArea);
    restoreLinkSyntax(noteArea);
    notesEditing = true;
    noteArea.contentEditable = "true";
    noteArea.classList.add("editing");
    editNotesBtn.hidden = true;
    saveNotesBtn.hidden = false;
    createCardBtn.hidden = false;
    noteArea.focus();
  }

  async function exitNotesEditing() {
    notesEditing = false;
    noteArea.contentEditable = "false";
    noteArea.classList.remove("editing");
    normalizeTermBoundaries(noteArea);
    removeEditorMarkers(noteArea);
    convertLinkSyntax(noteArea);
    editNotesBtn.hidden = false;
    saveNotesBtn.hidden = true;
    createCardBtn.hidden = true;
    markDirty();
    try { await saveState(); } catch (_) { /* Status displays the error. */ }
    attachConceptClicks(noteArea);
  }

  function createConceptFromSelection() {
    if (!signedInUser) return;
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      alert("Select a word or phrase inside your notes first.");
      return;
    }

    const selectedText = selection.toString().trim();
    const selectedRange = selection.getRangeAt(0);

    if (!noteArea.contains(selectedRange.commonAncestorContainer)) {
      alert("Select text inside your notes.");
      return;
    }

    let conceptKey = conceptKeyFromTitle(selectedText);

    if (!conceptKey) {
      conceptKey = slugify(selectedText);
      if (!conceptKey) return;

      concepts[conceptKey] = {
        title: selectedText,
        text: ""
      };
    }

    const termSpan = document.createElement("span");
    termSpan.className = "term";
    termSpan.dataset.concept = conceptKey;
    termSpan.textContent = selectedText;

    selectedRange.deleteContents();
    selectedRange.insertNode(termSpan);
    selection.removeAllRanges();

    markDirty();
    renderConcept(conceptKey, false);
    startCardEditing();
  }

  editNotesBtn.addEventListener("click", enterNotesEditing);
  saveNotesBtn.addEventListener("click", exitNotesEditing);
  noteArea.addEventListener("keydown", event => {
    if (!notesEditing || event.key !== "Enter" || event.isComposing) return;

    event.preventDefault();
    insertPlainLineBreak();
    markDirty();
  });

  noteArea.addEventListener("beforeinput", event => {
    if (!notesEditing || !event.inputType.startsWith("insert")) return;
    moveCaretOutsideTermBoundary();
  });

  noteArea.addEventListener("paste", event => {
    if (!notesEditing) return;

    event.preventDefault();
    const plainText = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, plainText);
    markDirty();
  });

  noteArea.addEventListener("input", markDirty);
  window.addEventListener("beforeunload", event => {
    if (changeVersion !== savedVersion ||
        (!cardEditor.hidden && cardTextInput.value !== (concepts[currentConceptKey]?.text || ""))) {
      event.preventDefault();
    }
  });

  createCardBtn.addEventListener("click", event => {
    event.stopPropagation();
    createConceptFromSelection();
  });

  editCardBtn.addEventListener("click", startCardEditing);
  saveCardBtn.addEventListener("click", saveCurrentCard);
  deleteCardBtn.addEventListener("click", deleteCurrentCard);
  cancelCardBtn.addEventListener("click", () => {
    cardTextInput.value = concepts[currentConceptKey]?.text || "";
    renderConcept(currentConceptKey, false);
  });

  backBtn.addEventListener("click", () => {
    if (!historyStack.length) return;
    const previousKey = historyStack.pop();
    renderConcept(previousKey, false);
  });

  closeBtn.addEventListener("click", closeCard);

  shortcutSettingsBtn.addEventListener("click", openShortcutDialog);
  closeShortcutDialogBtn.addEventListener("click", () => shortcutDialog.close());
  cancelShortcutsBtn.addEventListener("click", () => shortcutDialog.close());
  saveShortcutsBtn.addEventListener("click", saveShortcutSettings);
  resetShortcutsBtn.addEventListener("click", () => {
    pendingShortcuts = JSON.parse(JSON.stringify(defaultShortcuts));
    shortcutMessage.textContent = "";
    updateShortcutLabels(pendingShortcuts);
  });
  editShortcutInput.addEventListener("keydown", event => recordShortcut(event, "edit"));
  saveShortcutInput.addEventListener("keydown", event => recordShortcut(event, "save"));
  createShortcutInput.addEventListener("keydown", event => recordShortcut(event, "create"));

  document.addEventListener("keydown", event => {
    if (!signedInUser || event.repeat || shortcutDialog.open) return;

    if (shortcutMatches(event, shortcuts.edit)) {
      event.preventDefault();
      if (!notesEditing) enterNotesEditing();
      return;
    }

    if (shortcutMatches(event, shortcuts.save)) {
      event.preventDefault();
      if (notesEditing) exitNotesEditing();
      return;
    }

    if (shortcutMatches(event, shortcuts.create)) {
      event.preventDefault();
      createConceptFromSelection();
    }
  });

  document.addEventListener("click", event => {
    const cardIsBeingEdited = !cardEditor.hidden;
    if (
      conceptCard.classList.contains("open") &&
      !cardIsBeingEdited &&
      !conceptCard.contains(event.target)
    ) {
      closeCard();
    }
  });

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = loginForm.querySelector("button");
    button.disabled = true;
    authMessage.textContent = "Signing in…";
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passwordInput.value
      });
      if (error) throw error;
      if (!data.user) throw new Error("Sign-in did not return an account.");
      signedInUser = data.user;
      await loadState();
      prepareLoadedNotes();
      legacyDrafts = revision === null ? findLegacyDrafts() : [];
      importLegacyBtn.hidden = legacyDrafts.length === 0;
      authPanel.hidden = true;
      workspace.hidden = false;
      shortcutSettingsBtn.hidden = false;
      signOutBtn.hidden = false;
      passwordInput.value = "";
      authMessage.textContent = "";
    } catch (error) {
      authMessage.textContent = error.message;
      if (signedInUser) {
        await client.auth.signOut();
        signedInUser = null;
      }
    } finally {
      button.disabled = false;
    }
  });

  signOutBtn.addEventListener("click", async () => {
    if (!cardEditor.hidden && cardTextInput.value !== (concepts[currentConceptKey]?.text || "")) {
      saveStatus.textContent = "Save or cancel the card before signing out.";
      return;
    }
    try {
      await saveState();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (error) {
      saveStatus.textContent = `Could not sign out safely: ${error.message}`;
      return;
    }
    signedInUser = null;
    noteArea.replaceChildren();
    noteArea.contentEditable = "false";
    noteArea.classList.remove("editing");
    notesEditing = false;
    editNotesBtn.hidden = false;
    saveNotesBtn.hidden = true;
    createCardBtn.hidden = true;
    concepts = {};
    legacyDrafts = [];
    closeCard();
    cardEditor.hidden = true;
    cardTextInput.value = "";
    revision = null;
    workspace.hidden = true;
    authPanel.hidden = false;
    shortcutSettingsBtn.hidden = true;
    signOutBtn.hidden = true;
    importLegacyBtn.hidden = true;
    saveStatus.textContent = "";
    emailInput.value = "";
    passwordInput.value = "";
  });

  retrySaveBtn.addEventListener("click", () => { void saveState().catch(() => {}); });

  importLegacyBtn.addEventListener("click", () => {
    legacySourceSelect.replaceChildren();
    legacyDrafts.forEach((draft, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${draft.label} (${(draft.state.noteHtml || "").length} characters)`;
      legacySourceSelect.appendChild(option);
    });
    legacyMessage.textContent = "";
    legacyDialog.showModal();
  });
  document.getElementById("closeLegacyDialogBtn").addEventListener("click", () => legacyDialog.close());
  document.getElementById("cancelLegacyBtn").addEventListener("click", () => legacyDialog.close());
  confirmLegacyBtn.addEventListener("click", async () => {
    const draft = legacyDrafts[Number(legacySourceSelect.value)];
    if (!draft || revision !== null || changeVersion !== savedVersion ||
        (!cardEditor.hidden && cardTextInput.value !== (concepts[currentConceptKey]?.text || ""))) {
      legacyMessage.textContent = "Import is available only before you start a new online document.";
      return;
    }
    noteArea.innerHTML = draft.state.noteHtml || "";
    concepts = draft.state.concepts || {};
    shortcuts = {
      edit: draft.state.shortcuts?.edit || defaultShortcuts.edit,
      save: draft.state.shortcuts?.save || defaultShortcuts.save,
      create: draft.state.shortcuts?.create || defaultShortcuts.create
    };
    closeCard();
    prepareLoadedNotes();
    markDirty();
    confirmLegacyBtn.disabled = true;
    try {
      await saveState();
      importLegacyBtn.hidden = true;
      legacyDialog.close();
    } catch (error) {
      legacyMessage.textContent = `Import is not saved online: ${error.message}`;
    } finally {
      confirmLegacyBtn.disabled = false;
    }
  });

  function initialize() {
    if (!config.url || !config.publishableKey) {
      authMessage.textContent = "Online storage needs to be connected in config.js before sign-in will work.";
      loginForm.querySelector("button").disabled = true;
      return;
    }
    if (!window.supabase?.createClient) {
      authMessage.textContent = "The sign-in library could not load. Check your connection and reload.";
      loginForm.querySelector("button").disabled = true;
      return;
    }
    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        detectSessionInUrl: false,
        autoRefreshToken: true
      }
    });
  }

  initialize();
})();
