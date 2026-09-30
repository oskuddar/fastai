(() => {
  const STORAGE_KEY = "oskuddar-fastai-freeform-v3";
  const BACKUP_KEY = `${STORAGE_KEY}-backup`;
  const PUBLIC_STATE_URL = "published-state.json";
  const isPublicView = location.hostname === "oskuddar.github.io" ||
    new URLSearchParams(location.search).has("public-preview");

  const defaultConcepts = {
    resnet18: {
      title: "ResNet18",
      text: "An 18-layer residual convolutional neural network architecture.\n\nUses residual/skip connections.\n\nImplemented in frameworks such as [[PyTorch]]."
    },
    pytorch: {
      title: "PyTorch",
      text: "A Python framework for building and training neural networks.\n\nYou can write anything you want in this card."
    }
  };

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
  const exportSnapshotBtn = document.getElementById("exportSnapshotBtn");
  const editShortcutInput = document.getElementById("editShortcutInput");
  const editShortcutHint = document.getElementById("editShortcutHint");

  const defaultShortcuts = {
    edit: { code: "KeyD", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
    save: { code: "KeyS", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
    create: { code: "KeyA", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }
  };

  let concepts = JSON.parse(JSON.stringify(defaultConcepts));
  let historyStack = [];
  let currentConceptKey = null;
  let notesEditing = false;
  let shortcuts = JSON.parse(JSON.stringify(defaultShortcuts));
  let pendingShortcuts = JSON.parse(JSON.stringify(defaultShortcuts));
  let autosaveTimer = null;

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

  function saveState() {
    if (isPublicView) return;

    const noteClone = noteArea.cloneNode(true);
    const walker = document.createTreeWalker(noteClone, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      walker.currentNode.textContent = walker.currentNode.textContent.replace(/\u200B/g, "");
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        noteHtml: noteClone.innerHTML,
        concepts: concepts,
        shortcuts: shortcuts
      })
    );
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveState, 250);
  }

  async function loadPublishedState() {
    const response = await fetch(`${PUBLIC_STATE_URL}?v=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Published notes are unavailable.");

    const publishedState = await response.json();
    noteArea.innerHTML = publishedState.noteHtml || "";
    concepts = publishedState.concepts || {};
  }

  function exportPublicSnapshot() {
    if (notesEditing) exitNotesEditing();

    const snapshot = {
      noteHtml: noteArea.innerHTML,
      concepts: concepts,
      publishedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json"
    });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = "published-state.json";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  function loadState() {
    const savedText = localStorage.getItem(STORAGE_KEY);
    if (!savedText) return;

    try {
      const savedState = JSON.parse(savedText);
      if (savedState.noteHtml) noteArea.innerHTML = savedState.noteHtml;
      if (savedState.concepts) concepts = savedState.concepts;
      if (savedState.shortcuts) {
        shortcuts = {
          edit: savedState.shortcuts.edit || defaultShortcuts.edit,
          save: savedState.shortcuts.save || defaultShortcuts.save,
          create: savedState.shortcuts.create || defaultShortcuts.create
        };
      }
    } catch (error) {
      console.warn("Could not load notes.", error);
    }
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
    saveState();
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

  function flattenPastedMarkdownLinks(rootElement) {
    rootElement.querySelectorAll("a[href]:not(.external-link)").forEach(link => {
      const previousText = link.previousSibling?.nodeType === Node.TEXT_NODE
        ? link.previousSibling.textContent
        : "";
      const nextText = link.nextSibling?.nodeType === Node.TEXT_NODE
        ? link.nextSibling.textContent
        : "";
      const hasOpeningSyntax = /(?:!!|!\\!)\[$/.test(previousText);
      const hasClosingSyntax = /^\]\(https?:\/\/[^)]+\)!!/.test(nextText);

      if (hasOpeningSyntax && hasClosingSyntax) {
        link.replaceWith(document.createTextNode(link.textContent));
      }
    });
    rootElement.normalize();
  }

  function convertLinkSyntax(rootElement) {
    flattenPastedMarkdownLinks(rootElement);
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!parent?.closest("a, .term")) textNodes.push(walker.currentNode);
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent || "";
      const linkPattern = /(?:!!|!\\!)(?:\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^!\s]+))!!/g;
      let match;
      let lastIndex = 0;
      const fragment = document.createDocumentFragment();

      while ((match = linkPattern.exec(text)) !== null) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));

        const url = match[1] || match[2];
        const link = document.createElement("a");
        link.className = "external-link";
        link.href = url;
        link.dataset.url = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = url;
        link.textContent = "[link]";
        fragment.appendChild(link);

        lastIndex = linkPattern.lastIndex;
      }

      if (lastIndex === 0) return;
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      textNode.replaceWith(fragment);
    });
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
    editCardBtn.hidden = isPublicView;
    deleteCardBtn.hidden = isPublicView;
    conceptCard.classList.add("open");
    backBtn.disabled = historyStack.length === 0;

    renderPath();
    attachConceptClicks(cardView);
  }

  function startCardEditing() {
    if (isPublicView) return;
    if (!currentConceptKey || !concepts[currentConceptKey]) return;
    cardTextInput.value = concepts[currentConceptKey].text || "";
    cardView.hidden = true;
    cardEditor.hidden = false;
    editCardBtn.hidden = true;
    deleteCardBtn.hidden = true;
    cardTextInput.focus();
  }

  function saveCurrentCard() {
    if (!currentConceptKey || !concepts[currentConceptKey]) return;
    concepts[currentConceptKey].text = cardTextInput.value;
    saveState();
    renderConcept(currentConceptKey, false);
  }

  function unlinkConceptEverywhere(conceptKey) {
    noteArea.querySelectorAll("[data-concept]").forEach(element => {
      if (element.dataset.concept === conceptKey) {
        element.replaceWith(document.createTextNode(element.textContent));
      }
    });
  }

  function deleteCurrentCard() {
    if (isPublicView) return;
    if (!currentConceptKey || !concepts[currentConceptKey]) return;

    const deletedKey = currentConceptKey;
    unlinkConceptEverywhere(deletedKey);
    delete concepts[deletedKey];

    historyStack = historyStack.filter(key => key !== deletedKey);
    currentConceptKey = null;

    saveState();
    closeCard();
    attachConceptClicks(noteArea);
  }

  function enterNotesEditing() {
    if (isPublicView) return;
    const lastSavedState = localStorage.getItem(STORAGE_KEY);
    if (lastSavedState) localStorage.setItem(BACKUP_KEY, lastSavedState);
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

  function exitNotesEditing() {
    notesEditing = false;
    noteArea.contentEditable = "false";
    noteArea.classList.remove("editing");
    normalizeTermBoundaries(noteArea);
    removeEditorMarkers(noteArea);
    convertLinkSyntax(noteArea);
    editNotesBtn.hidden = false;
    saveNotesBtn.hidden = true;
    createCardBtn.hidden = true;
    saveState();
    attachConceptClicks(noteArea);
  }

  function createConceptFromSelection() {
    if (isPublicView) return;
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

    saveState();
    renderConcept(conceptKey, false);
    startCardEditing();
  }

  editNotesBtn.addEventListener("click", enterNotesEditing);
  saveNotesBtn.addEventListener("click", exitNotesEditing);
  noteArea.addEventListener("keydown", event => {
    if (!notesEditing || event.key !== "Enter" || event.isComposing) return;

    event.preventDefault();
    insertPlainLineBreak();
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
  });

  noteArea.addEventListener("input", scheduleAutosave);
  window.addEventListener("beforeunload", saveState);

  createCardBtn.addEventListener("click", event => {
    event.stopPropagation();
    createConceptFromSelection();
  });

  editCardBtn.addEventListener("click", startCardEditing);
  saveCardBtn.addEventListener("click", saveCurrentCard);
  deleteCardBtn.addEventListener("click", deleteCurrentCard);
  cancelCardBtn.addEventListener("click", () => renderConcept(currentConceptKey, false));

  backBtn.addEventListener("click", () => {
    if (!historyStack.length) return;
    const previousKey = historyStack.pop();
    renderConcept(previousKey, false);
  });

  closeBtn.addEventListener("click", closeCard);

  shortcutSettingsBtn.addEventListener("click", openShortcutDialog);
  exportSnapshotBtn.addEventListener("click", exportPublicSnapshot);
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
    if (isPublicView || event.repeat || shortcutDialog.open) return;

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

  async function initialize() {
    if (isPublicView) {
      document.body.classList.add("public-view");
      document.querySelector(".toolbar").hidden = true;
      shortcutSettingsBtn.hidden = true;
      exportSnapshotBtn.hidden = true;

      try {
        await loadPublishedState();
      } catch (error) {
        console.warn(error.message);
        noteArea.innerHTML = "<p>No notes have been published yet.</p>";
        concepts = {};
      }
    } else {
      loadState();
    }

    normalizeTermBoundaries(noteArea);
    convertLinkSyntax(noteArea);
    attachConceptClicks(noteArea);
    updateShortcutLabels();

    if (!isPublicView) enterNotesEditing();
  }

  initialize();
})();
