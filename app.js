(() => {
  const STORAGE_KEY = "oskuddar-fastai-static-v1";

  const defaultConcepts = {
    resnet18: {
      title: "ResNet18",
      description: "An 18-layer residual convolutional neural network architecture.",
      remember: [
        "Uses residual or skip connections.",
        "Smaller and faster than deeper ResNet variants.",
        "A useful baseline for image classification.",
        "Often used with transfer learning."
      ],
      experience: [
        "Add your own observations here."
      ],
      related: ["PyTorch"]
    },
    pytorch: {
      title: "PyTorch",
      description: "A Python framework for building and training neural networks.",
      remember: [
        "Provides automatic differentiation.",
        "Supports GPU computation.",
        "Used underneath fastai."
      ],
      experience: [
        "Add practical things you discover while using it."
      ],
      related: ["Tensor"]
    },
    tensor: {
      title: "Tensor",
      description: "A multidimensional array used to store data, model parameters, and intermediate values.",
      remember: [
        "Conceptually similar to a NumPy array.",
        "Can live on CPU or GPU.",
        "Used throughout PyTorch models."
      ],
      experience: [
        "Add your own tensor-related reminders here."
      ],
      related: ["PyTorch"]
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

  const descriptionInput = document.getElementById("descriptionInput");
  const rememberInput = document.getElementById("rememberInput");
  const experienceInput = document.getElementById("experienceInput");
  const relatedInput = document.getElementById("relatedInput");

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

      if (savedState.noteHtml) {
        noteArea.innerHTML = savedState.noteHtml;
      }

      if (savedState.concepts) {
        concepts = savedState.concepts;
      }
    } catch (error) {
      console.warn("Could not load saved notes.", error);
    }
  }

  function buildRelatedHtml(relatedTitles) {
    if (!relatedTitles?.length) {
      return "<p>None yet.</p>";
    }

    const relatedHtml = relatedTitles.map(title => {
      const relatedKey = conceptKeyFromTitle(title);

      if (!relatedKey) {
        return `<span>${escapeHtml(title)}</span>`;
      }

      return `<span class="term" data-concept="${escapeHtml(relatedKey)}">${escapeHtml(concepts[relatedKey].title)}</span>`;
    });

    return `<p>${relatedHtml.join(", ")}</p>`;
  }

  function attachConceptClicks(rootElement) {
    rootElement.querySelectorAll(".term").forEach(termElement => {
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

    const rememberItems = (concept.remember || [])
      .map(item => `<li>${escapeHtml(item)}</li>`)
      .join("");

    const experienceItems = (concept.experience || [])
      .map(item => `<li>${escapeHtml(item)}</li>`)
      .join("");

    cardView.innerHTML = `
      <p>${escapeHtml(concept.description || "")}</p>

      <div class="section-title">What I want to remember</div>
      <ul>${rememberItems}</ul>

      <div class="section-title">My experience</div>
      <ul>${experienceItems}</ul>

      <div class="section-title">Related</div>
      ${buildRelatedHtml(concept.related || [])}
    `;

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

    const concept = concepts[currentConceptKey];

    descriptionInput.value = concept.description || "";
    rememberInput.value = (concept.remember || []).join("\n");
    experienceInput.value = (concept.experience || []).join("\n");
    relatedInput.value = (concept.related || []).join(", ");

    cardView.hidden = true;
    cardEditor.hidden = false;
    editCardBtn.hidden = true;
  }

  function saveCurrentCard() {
    if (!currentConceptKey || !concepts[currentConceptKey]) return;

    concepts[currentConceptKey].description = descriptionInput.value.trim();

    concepts[currentConceptKey].remember = rememberInput.value
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

    concepts[currentConceptKey].experience = experienceInput.value
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

    concepts[currentConceptKey].related = relatedInput.value
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);

    saveState();
    renderConcept(currentConceptKey, false);
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
        description: "",
        remember: [],
        experience: [],
        related: []
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
