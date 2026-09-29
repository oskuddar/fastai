(() => {
  const STORAGE_KEY = "oskuddar-fastai-static-v2";

  const defaultConcepts = {
    resnet18: {
      title: "ResNet18",
      text: "An 18-layer residual convolutional neural network architecture.\n\nUses residual or skip connections and is a useful lightweight baseline for image classification.\n\nBuilt with [[PyTorch]]."
    },
    pytorch: {
      title: "PyTorch",
      text: "A Python framework for building and training neural networks.\n\nIts core data structure is the [[Tensor]]."
    },
    tensor: {
      title: "Tensor",
      text: "A multidimensional array used to store data, model parameters, and intermediate values.\n\nCommonly used throughout [[PyTorch]]."
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
  const saveCardBtn = document.getElementById("saveCardBtn");
  const cancelCardBtn = document.getElementById("cancelCardBtn");
  const deleteCardBtn = document.getElementById("deleteCardBtn");
  const cardTextInput = document.getElementById("cardTextInput");

  let concepts = structuredClone(defaultConcepts);
  let historyStack = [];
  let currentConceptKey = null;
  let notesEditing = false;

  function escapeHtml(value) {
    const temp = document.createElement("div");
    temp.textContent = value ?? "";
    return temp.innerHTML;
  }

  function slugify(value) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function conceptKeyFromTitle(title) {
    const normalized = title.trim().toLowerCase();

    return Object.keys(concepts).find(
      key => concepts[key].title.toLowerCase() === normalized
    ) || null;
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        noteHtml: noteArea.innerHTML,
        concepts
      })
    );
  }

  function loadState() {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState) return;

    try {
      const savedState = JSON.parse(rawState);

      if (savedState.noteHtml) noteArea.innerHTML = savedState.noteHtml;
      if (savedState.concepts) concepts = savedState.concepts;
    } catch (error) {
      console.warn("Could not load saved notes.", error);
    }
  }

  function renderCardText(rawText) {
    const escapedText = escapeHtml(rawText || "");

    const withLinks = escapedText.replace(
      /\[\[([^\]]+)\]\]/g,
      (match, title) => {
        const key = conceptKeyFromTitle(title);
        if (!key) return escapeHtml(title);

        return `<span class="inline-card-link" data-concept="${escapeHtml(key)}">${escapeHtml(concepts[key].title)}</span>`;
      }
    );

    return withLinks.replace(/\n/g, "<br>");
  }

  function attachConceptClicks(rootElement) {
    rootElement.querySelectorAll(".term, .inline-card-link").forEach(termElement => {
      termElement.onclick = () => {
        if (notesEditing && rootElement === noteArea) return;
        renderConcept(termElement.dataset.concept, true);
      };
    });
  }

  function renderPath() {
    pathTrail.replaceChildren();

    const fullPath = [
      ...historyStack,
      ...(currentConceptKey ? [currentConceptKey] : [])
    ];

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

    if (
      pushHistory &&
      currentConceptKey &&
      currentConceptKey !== conceptKey
    ) {
      historyStack.push(currentConceptKey);
    }

    currentConceptKey = conceptKey;
    cardTitle.textContent = concept.title;
    cardView.innerHTML = renderCardText(concept.text || "");

    cardEditor.hidden = true;
    cardView.hidden = false;
    editCardBtn.hidden = false;
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
    cardTextInput.focus();
  }

  function saveCurrentCard() {
    if (!currentConceptKey || !concepts[currentConceptKey]) return;

    concepts[currentConceptKey].text = cardTextInput.value;
    saveState();
    renderConcept(currentConceptKey, false);
  }

  function unlinkConceptEverywhere(conceptKey) {
    noteArea.querySelectorAll(`[data-concept="${CSS.escape(conceptKey)}"]`).forEach(element => {
      const textNode = document.createTextNode(element.textContent);
      element.replaceWith(textNode);
    });
  }

  function deleteCurrentCard() {
    if (!currentConceptKey || !concepts[currentConceptKey]) return;

    const title = concepts[currentConceptKey].title;
    const confirmed = confirm(`Delete the "${title}" card and remove its links from the notes?`);
    if (!confirmed) return;

    unlinkConceptEverywhere(currentConceptKey);
    delete concepts[currentConceptKey];

    historyStack = historyStack.filter(key => key !== currentConceptKey);
    currentConceptKey = null;

    saveState();

    conceptCard.classList.remove("open");
    pathTrail.replaceChildren();
    attachConceptClicks(noteArea);
  }

  function enterNotesEditing() {
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
    editNotesBtn.hidden = false;
    saveNotesBtn.hidden = true;
    createCardBtn.hidden = true;

    saveState();
    attachConceptClicks(noteArea);
  }

  function createConceptFromSelection() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      alert("Select a word or phrase first.");
      return;
    }

    const selectedText = selection.toString().trim();

    if (!selectedText) {
      alert("Select a word or phrase first.");
      return;
    }

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
  createCardBtn.addEventListener("click", createConceptFromSelection);

  editCardBtn.addEventListener("click", startCardEditing);
  saveCardBtn.addEventListener("click", saveCurrentCard);
  deleteCardBtn.addEventListener("click", deleteCurrentCard);

  cancelCardBtn.addEventListener("click", () => {
    renderConcept(currentConceptKey, false);
  });

  backBtn.addEventListener("click", () => {
    if (!historyStack.length) return;
    const previousKey = historyStack.pop();
    renderConcept(previousKey, false);
  });

  closeBtn.addEventListener("click", () => {
    conceptCard.classList.remove("open");
    historyStack = [];
    currentConceptKey = null;
    pathTrail.replaceChildren();
  });

  loadState();
  attachConceptClicks(noteArea);
})();
