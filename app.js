(() => {
  const STORAGE_KEY = "oskuddar-fastai-freeform-v3";

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

  const defaultShortcuts = {
    save: { code: "KeyS", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false },
    create: { code: "KeyA", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }
  };

  let concepts = JSON.parse(JSON.stringify(defaultConcepts));
  let historyStack = [];
  let currentConceptKey = null;
  let notesEditing = false;
  let shortcuts = JSON.parse(JSON.stringify(defaultShortcuts));
  let pendingShortcuts = JSON.parse(JSON.stringify(defaultShortcuts));

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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        noteHtml: noteArea.innerHTML,
        concepts: concepts,
        shortcuts: shortcuts
      })
    );
  }

  function loadState() {
    const savedText = localStorage.getItem(STORAGE_KEY);
    if (!savedText) return;

    try {
      const savedState = JSON.parse(savedText);
      if (savedState.noteHtml) noteArea.innerHTML = savedState.noteHtml;
      if (savedState.concepts) concepts = savedState.concepts;
      if (savedState.shortcuts?.save && savedState.shortcuts?.create) {
        shortcuts = savedState.shortcuts;
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
    saveShortcutInput.textContent = shortcutLabel(bindings.save);
    createShortcutInput.textContent = shortcutLabel(bindings.create);
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
    if (shortcutLabel(pendingShortcuts.save) === shortcutLabel(pendingShortcuts.create)) {
      shortcutMessage.textContent = "Save and Create need different shortcuts.";
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

  function convertLinkSyntax(rootElement) {
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!parent?.closest("a, .term")) textNodes.push(walker.currentNode);
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent || "";
      const linkPattern = /!!(?:\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^!\s]+))!!/g;
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

  function attachConceptClicks(rootElement) {
    rootElement.querySelectorAll(".term, .inline-card-link").forEach(termElement => {
      termElement.onclick = event => {
        if (notesEditing && rootElement === noteArea) return;
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
    editCardBtn.hidden = false;
    deleteCardBtn.hidden = false;
    conceptCard.classList.add("open");
    backBtn.disabled = historyStack.length === 0;

    renderPath();
    attachConceptClicks(cardView);
  }

  function startCardEditing() {
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
    convertLinkSyntax(noteArea);
    editNotesBtn.hidden = false;
    saveNotesBtn.hidden = true;
    createCardBtn.hidden = true;
    saveState();
    attachConceptClicks(noteArea);
  }

  function createConceptFromSelection() {
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
    document.execCommand("insertLineBreak");
  });

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
  closeShortcutDialogBtn.addEventListener("click", () => shortcutDialog.close());
  cancelShortcutsBtn.addEventListener("click", () => shortcutDialog.close());
  saveShortcutsBtn.addEventListener("click", saveShortcutSettings);
  resetShortcutsBtn.addEventListener("click", () => {
    pendingShortcuts = JSON.parse(JSON.stringify(defaultShortcuts));
    shortcutMessage.textContent = "";
    updateShortcutLabels(pendingShortcuts);
  });
  saveShortcutInput.addEventListener("keydown", event => recordShortcut(event, "save"));
  createShortcutInput.addEventListener("keydown", event => recordShortcut(event, "create"));

  document.addEventListener("keydown", event => {
    if (event.repeat || shortcutDialog.open) return;

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

  loadState();
  convertLinkSyntax(noteArea);
  attachConceptClicks(noteArea);
  updateShortcutLabels();
})();
