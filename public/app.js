const views = [...document.querySelectorAll(".view")];
const navItems = [...document.querySelectorAll("[data-view]")];
const pageTitle = document.querySelector("#page-title");
const inspectForm = document.querySelector("#inspect-form");
const statusText = document.querySelector("#status");
const resultPanel = document.querySelector("#result");
const resultPlaceholder = document.querySelector("#result-placeholder");
const downloadButton = document.querySelector("#download");
const decodeForm = document.querySelector("#decode-form");
const proofForm = document.querySelector("#proof-form");
let latestProof;
let curriculumModules = [];
let activeCurriculumCategory = "All";
let curriculumQuery = "";
let nextRecommendedModule = null;

function storedTheme() {
  try { return localStorage.getItem("ckbuilder-theme"); } catch { return null; }
}

function applyTheme(theme) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  const button = document.querySelector("#theme-toggle");
  if (button) {
    button.dataset.theme = resolved;
    button.title = resolved === "dark" ? "Switch to light theme" : "Switch to dark theme";
    button.setAttribute("aria-label", button.title);
  }
  try { localStorage.setItem("ckbuilder-theme", resolved); } catch {}
}

applyTheme(storedTheme() ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
document.querySelector("#theme-toggle")?.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

for (const control of document.querySelectorAll("[data-scroll]")) {
  control.addEventListener("click", () => document.querySelector(`#${control.dataset.scroll}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(button.dataset.copy ?? "");
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => { button.textContent = original; }, 1200);
});

function activateView(name, updateHash = true) {
  const target = document.querySelector(`#view-${name}`) ?? document.querySelector("#view-overview");
  for (const view of views) view.classList.toggle("active", view === target);
  for (const item of navItems) {
    const active = item.dataset.view === target.id.replace("view-", "");
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  pageTitle.textContent = target.dataset.title ?? "CKBuilder Console";
  if (updateHash) history.replaceState(null, "", `#${target.id.replace("view-", "")}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

for (const item of navItems) item.addEventListener("click", () => activateView(item.dataset.view));
for (const item of document.querySelectorAll("[data-go]")) item.addEventListener("click", () => activateView(item.dataset.go));
window.addEventListener("hashchange", () => activateView(location.hash.slice(1) || "overview", false));
activateView(location.hash.slice(1) || "overview", false);

function fileAsBase64(file) {
  if (!file) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(reader.error ?? new Error("Cannot read document."));
    reader.readAsDataURL(file);
  });
}

async function fileDocumentPayload(file) {
  if (!file) return null;
  return { fileName: file.name, mimeType: file.type || "application/octet-stream", documentBase64: await fileAsBase64(file) };
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Cannot read file."));
    reader.readAsText(file);
  });
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.message ?? value.error ?? "Request failed.");
  return value;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok) {
    const error = new Error(value.message ?? value.error ?? "Request failed.");
    error.payload = value;
    throw error;
  }
  return value;
}

async function requestJson(url, method, body) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) { const error = new Error(value.message ?? value.error ?? "Request failed."); error.payload = value; throw error; }
  return value;
}

function text(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value ?? "—";
}

function setFormStatus(element, message, tone = "neutral") {
  element.textContent = message;
  element.dataset.tone = tone;
}

function setButtonBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel ?? button.textContent;
    button.disabled = false;
  }
}

function renderChecks(container, checks) {
  container.replaceChildren();
  for (const check of checks ?? []) {
    const row = document.createElement("div");
    row.className = `check ${check.ok === true ? "pass" : check.ok === false ? "fail" : "skip"}`;
    const icon = document.createElement("span");
    icon.className = "check-icon";
    icon.textContent = check.ok === true ? "✓" : check.ok === false ? "!" : "–";
    const content = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = String(check.name ?? "check").replaceAll("_", " ");
    const message = document.createElement("span");
    message.textContent = check.message ?? "No message supplied.";
    content.append(name, message);
    row.append(icon, content);
    container.append(row);
  }
}

function outcomeTone(value) {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized.includes("VALID") || normalized === "ACTIVE" || normalized === "MATCH") return "positive";
  if (normalized.includes("REVOKED") || normalized.includes("INVALID") || normalized.includes("MISMATCH") || normalized.includes("CONFLICT")) return "negative";
  return "neutral";
}

function renderProof(proof) {
  latestProof = proof;
  resultPanel.classList.remove("hidden");
  resultPlaceholder.classList.add("hidden");
  text("#outcome", proof.outcome);
  document.querySelector("#outcome").dataset.tone = outcomeTone(proof.outcome);
  text("#offchain", proof.offChain?.status ?? "NOT_FOUND");
  text("#onchain", proof.onChain?.status ?? "NOT_CHECKED");
  text("#document-result", proof.offChain?.documentVerified ? "MATCH" : "NOT VERIFIED");
  text("#consistency", proof.stateConsistency?.consistent === null || proof.stateConsistency?.consistent === undefined
    ? "NOT CHECKED"
    : proof.stateConsistency.consistent ? "MATCH" : "MISMATCH");

  for (const id of ["#offchain", "#onchain", "#document-result", "#consistency"]) {
    const element = document.querySelector(id);
    element.dataset.tone = outcomeTone(element.textContent);
  }

  const history = document.querySelector("#history");
  history.replaceChildren();
  const steps = proof.history?.steps ?? [];
  if (steps.length === 0) {
    const item = document.createElement("li");
    item.className = "history-empty";
    item.textContent = "No saved lineage evidence is available for this credential.";
    history.append(item);
  } else {
    for (const step of steps) {
      const item = document.createElement("li");
      const marker = document.createElement("span");
      marker.className = "history-marker";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = step.state;
      const tx = document.createElement("code");
      tx.textContent = step.txHash;
      content.append(title, tx);
      item.append(marker, content);
      history.append(item);
    }
  }

  renderChecks(document.querySelector("#checks"), proof.offChain?.checks);
  document.querySelector("#raw").textContent = JSON.stringify(proof, null, 2);
  const htmlCredential = document.querySelector("#html-credential");
  if (htmlCredential && proof.credentialId) { htmlCredential.href = `/api/certificate/${encodeURIComponent(proof.credentialId)}/html`; htmlCredential.classList.remove("hidden"); }
}

inspectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = inspectForm.querySelector("button[type=submit]");
  setButtonBusy(button, true, "Inspecting evidence…");
  setFormStatus(statusText, "Reading signed credential and public Cell evidence…");
  resultPanel.classList.add("hidden");
  resultPlaceholder.classList.remove("hidden");
  try {
    const file = document.querySelector("#document").files[0];
    const proof = await postJson("/api/inspect", {
      credentialId: document.querySelector("#credential-id").value.trim(),
      documentBase64: await fileAsBase64(file),
      skipChain: document.querySelector("#offline").checked
    });
    setFormStatus(statusText, "Inspection complete.", "success");
    renderProof(proof);
  } catch (error) {
    setFormStatus(statusText, error instanceof Error ? error.message : String(error), "error");
  } finally {
    setButtonBusy(button, false);
  }
});

downloadButton.addEventListener("click", () => {
  if (!latestProof) return;
  const blob = new Blob([`${JSON.stringify(latestProof, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${latestProof.credentialId}-verification-proof.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

decodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#decode-status");
  const output = document.querySelector("#decode-result");
  const button = decodeForm.querySelector("button[type=submit]");
  setButtonBusy(button, true, "Decoding…");
  setFormStatus(status, "Validating binary layout…");
  output.classList.add("hidden");
  try {
    const result = await postJson("/api/decode-cell", {
      cellData: document.querySelector("#cell-data").value.trim(),
      expectedCredentialHash: document.querySelector("#expected-credential-hash").value.trim() || undefined,
      expectedIssuerLockHash: document.querySelector("#expected-issuer-hash").value.trim() || undefined
    });
    setFormStatus(status, result.canonical ? "Canonical credential Cell data." : "Decoded with validation errors.", result.canonical ? "success" : "error");
    output.textContent = JSON.stringify(result, null, 2);
    output.classList.remove("hidden");
  } catch (error) {
    setFormStatus(status, error instanceof Error ? error.message : String(error), "error");
    if (error.payload) {
      output.textContent = JSON.stringify(error.payload, null, 2);
      output.classList.remove("hidden");
    }
  } finally {
    setButtonBusy(button, false);
  }
});

proofForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#proof-status");
  const container = document.querySelector("#proof-checks");
  const button = proofForm.querySelector("button[type=submit]");
  setButtonBusy(button, true, "Verifying…");
  setFormStatus(status, "Recomputing proof digest and privacy checks…");
  container.replaceChildren();
  try {
    const file = document.querySelector("#proof-file").files[0];
    const proof = JSON.parse(await readFileText(file));
    const result = await postJson("/api/verify-proof", { proof });
    setFormStatus(status, result.valid ? "Proof structure and digest are valid." : "Proof verification failed.", result.valid ? "success" : "error");
    renderChecks(container, result.checks);
  } catch (error) {
    setFormStatus(status, error instanceof Error ? error.message : String(error), "error");
    if (error.payload?.checks) renderChecks(container, error.payload.checks);
  } finally {
    setButtonBusy(button, false);
  }
});

function replaceList(selector, values, ordered = false) {
  const list = document.querySelector(selector);
  list.replaceChildren();
  for (const value of values ?? []) {
    const item = document.createElement("li");
    item.textContent = value;
    list.append(item);
  }
  if ((values ?? []).length === 0) {
    const item = document.createElement("li");
    item.textContent = ordered ? "No steps supplied." : "No items supplied.";
    list.append(item);
  }
}

function moduleSearchText(module) {
  return [module.title, module.category, module.level, module.summary, ...(module.outcomes ?? []), ...(module.checkpoints ?? []), ...(module.commands ?? [])]
    .join(" ").toLowerCase();
}

function moduleStatusLabel(module) {
  if (module.state === "complete") return "Complete";
  if (module.state === "available") return module.id === nextRecommendedModule?.id ? "Recommended" : "Available";
  return "Planned";
}

function openLessonDialog(module) {
  const dialog = document.querySelector("#lesson-dialog");
  text("#lesson-dialog-sequence", String(module.sequence).padStart(2, "0"));
  text("#lesson-dialog-category", `${module.category} · ${module.level}`);
  text("#lesson-dialog-title", module.title);
  text("#lesson-dialog-summary", module.summary);
  text("#lesson-dialog-evidence", module.completionFile);

  const meta = document.querySelector("#lesson-dialog-meta");
  meta.replaceChildren();
  for (const value of [`${module.estimatedMinutes} minutes`, moduleStatusLabel(module), `${module.questions ?? 3} quiz questions`]) {
    const badge = document.createElement("span");
    badge.textContent = value;
    meta.append(badge);
  }

  replaceList("#lesson-dialog-outcomes", module.outcomes);
  replaceList("#lesson-dialog-checkpoints", module.checkpoints);
  replaceList("#lesson-dialog-lab", module.lab, true);

  const commands = document.querySelector("#lesson-dialog-commands");
  commands.replaceChildren();
  for (const command of module.commands ?? []) {
    const row = document.createElement("div");
    const code = document.createElement("code");
    code.textContent = command;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.dataset.copy = command;
    copy.textContent = "Copy";
    row.append(code, copy);
    commands.append(row);
  }

  const references = document.querySelector("#lesson-dialog-references");
  references.replaceChildren();
  for (const reference of module.references ?? []) {
    const link = document.createElement("a");
    link.href = reference.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = reference.title;
    references.append(link);
  }

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function renderCurriculum() {
  const grid = document.querySelector("#curriculum-grid");
  const empty = document.querySelector("#curriculum-empty");
  const filtered = curriculumModules.filter((module) => {
    const categoryMatch = activeCurriculumCategory === "All" || module.category === activeCurriculumCategory;
    const queryMatch = !curriculumQuery || moduleSearchText(module).includes(curriculumQuery);
    return categoryMatch && queryMatch;
  });
  grid.replaceChildren();
  empty.classList.toggle("hidden", filtered.length > 0);

  for (const module of filtered) {
    const card = document.createElement("article");
    card.className = "curriculum-card";
    card.dataset.state = module.state;

    const head = document.createElement("div");
    head.className = "curriculum-card-head";
    const number = document.createElement("span");
    number.className = "module-number";
    number.textContent = String(module.sequence).padStart(2, "0");
    const tags = document.createElement("div");
    tags.className = "module-tags";
    for (const value of [module.category, module.level]) {
      const tag = document.createElement("span");
      tag.textContent = value;
      tags.append(tag);
    }
    const status = document.createElement("span");
    status.className = "module-status";
    status.dataset.state = module.state;
    status.textContent = moduleStatusLabel(module);
    head.append(number, tags, status);

    const title = document.createElement("h3");
    title.textContent = module.title;
    const summary = document.createElement("p");
    summary.textContent = module.summary;

    const outcomes = document.createElement("ul");
    outcomes.className = "module-outcomes";
    for (const outcome of (module.outcomes ?? []).slice(0, 2)) {
      const item = document.createElement("li");
      item.textContent = outcome;
      outcomes.append(item);
    }

    const foot = document.createElement("div");
    foot.className = "curriculum-card-foot";
    const duration = document.createElement("span");
    duration.textContent = `${module.estimatedMinutes} min`;
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = "View module";
    action.addEventListener("click", () => openLessonDialog(module));
    foot.append(duration, action);
    card.append(head, title, summary, outcomes, foot);
    grid.append(card);
  }
}

function renderCurriculumFilters(modules) {
  const filters = document.querySelector("#curriculum-filters");
  filters.replaceChildren();
  for (const category of ["All", ...new Set(modules.map((module) => module.category))]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category;
    button.classList.toggle("active", category === activeCurriculumCategory);
    button.addEventListener("click", () => {
      activeCurriculumCategory = category;
      for (const item of filters.children) item.classList.toggle("active", item === button);
      renderCurriculum();
    });
    filters.append(button);
  }
}

function renderLearning(overview) {
  text("#learning-percent", `${overview.summary.percent}%`);
  const ring = document.querySelector("#learning-ring");
  ring.style.setProperty("--progress", `${overview.summary.percent * 3.6}deg`);
  text("#learning-score-label", `${overview.summary.completed}/${overview.summary.total} tracked items`);
  text("#learning-score-detail", `${overview.summary.completeTracks}/${overview.summary.totalTracks} evidence tracks complete`);
  text("#metric-learning", `${overview.summary.completed}/${overview.summary.total}`);
  text("#metric-learning-note", `${overview.summary.completeTracks}/${overview.summary.totalTracks} tracks complete`);
  text("#sidebar-learning-label", `${overview.summary.percent}% tracked`);
  document.querySelector("#sidebar-learning-progress").style.width = `${overview.summary.percent}%`;
  text("#track-count", `${overview.tracks.length} areas`);

  const curriculumSummary = overview.curriculumSummary ?? {};
  curriculumModules = (overview.curriculum ?? []).map((module) => ({ ...module, questions: 3 }));
  nextRecommendedModule = curriculumSummary.nextModule ?? curriculumModules[0] ?? null;
  text("#curriculum-module-count", curriculumSummary.total ?? curriculumModules.length);
  text("#curriculum-hours", curriculumSummary.estimatedHours ?? "—");
  text("#curriculum-progress", `${curriculumSummary.completed ?? 0}/${curriculumSummary.total ?? curriculumModules.length}`);
  text("#quiz-count", String(curriculumModules.length));
  text("#next-module-title", nextRecommendedModule?.title ?? "Curriculum complete");
  text("#next-module-meta", nextRecommendedModule ? `${nextRecommendedModule.category} · ${nextRecommendedModule.estimatedMinutes} min` : "All module evidence complete");
  const tutorialTrack = overview.tracks.find((track) => track.id === "basic-tutorials");
  text("#tutorial-progress", tutorialTrack ? `${tutorialTrack.completed}/${tutorialTrack.total}` : "0/5");
  const nextButton = document.querySelector("#next-module-button");
  nextButton.disabled = !nextRecommendedModule;
  nextButton.textContent = nextRecommendedModule ? `Open module ${String(nextRecommendedModule.sequence).padStart(2, "0")}` : "Curriculum complete";
  nextButton.onclick = () => nextRecommendedModule && openLessonDialog(nextRecommendedModule);

  renderCurriculumFilters(curriculumModules);
  renderCurriculum();
  const search = document.querySelector("#curriculum-search");
  search.addEventListener("input", () => {
    curriculumQuery = search.value.trim().toLowerCase();
    renderCurriculum();
  }, { once: false });

  const tracks = document.querySelector("#learning-tracks");
  tracks.replaceChildren();
  for (const track of overview.tracks) {
    const card = document.createElement("article");
    card.className = "panel learning-card";
    const header = document.createElement("div");
    header.className = "learning-card-head";
    const title = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = track.label;
    const location = document.createElement("code");
    location.textContent = track.location;
    title.append(name, location);
    const score = document.createElement("strong");
    score.textContent = `${track.completed}/${track.total}`;
    score.dataset.state = track.state;
    header.append(title, score);

    const description = document.createElement("p");
    description.textContent = track.description;
    const progress = document.createElement("div");
    progress.className = "progress-track";
    const bar = document.createElement("span");
    bar.style.width = `${track.percent}%`;
    progress.append(bar);
    const footer = document.createElement("div");
    footer.className = "learning-card-foot";
    const state = document.createElement("span");
    state.textContent = track.state.replace("-", " ");
    const percent = document.createElement("span");
    percent.textContent = `${track.percent}%`;
    footer.append(state, percent);
    card.append(header, description, progress, footer);
    tracks.append(card);
  }

  const milestones = document.querySelector("#milestones");
  milestones.replaceChildren();
  for (const milestone of overview.technicalMilestones) {
    const row = document.createElement("div");
    row.className = "milestone";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✓";
    const textNode = document.createElement("strong");
    textNode.textContent = milestone;
    row.append(icon, textNode);
    milestones.append(row);
  }
  text("#milestone-count", `${overview.technicalMilestones.length} complete`);

  const pending = document.querySelector("#learning-pending");
  pending.replaceChildren();
  if (overview.pending.length === 0) {
    const item = document.createElement("li");
    item.textContent = "All tracked evidence is complete.";
    pending.append(item);
  } else {
    for (const action of overview.pending) {
      const item = document.createElement("li");
      item.textContent = action;
      pending.append(item);
    }
  }

  const tutorialList = document.querySelector("#tutorial-list");
  tutorialList.replaceChildren();
  for (const [index, tutorial] of (overview.tutorials ?? []).entries()) {
    const card = document.createElement("article");
    card.className = "panel tutorial-card";
    const top = document.createElement("div");
    top.className = "tutorial-card-top";
    const ordinal = document.createElement("span");
    ordinal.className = "tutorial-ordinal";
    ordinal.textContent = String(index + 1).padStart(2, "0");
    const title = document.createElement("h3");
    title.textContent = tutorial.title;
    const duration = document.createElement("span");
    duration.className = "duration-badge";
    duration.textContent = `${tutorial.estimatedMinutes} min`;
    top.append(ordinal, title, duration);
    const checklist = document.createElement("ul");
    checklist.className = "compact-checklist";
    for (const requirement of tutorial.screenshots ?? []) {
      const item = document.createElement("li");
      item.textContent = requirement;
      checklist.append(item);
    }
    const actions = document.createElement("div");
    actions.className = "tutorial-actions";
    const link = document.createElement("a");
    link.className = "button small-button";
    link.href = tutorial.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open official tutorial";
    const evidence = document.createElement("code");
    evidence.textContent = tutorial.completionFile;
    actions.append(link, evidence);
    card.append(top, checklist, actions);
    tutorialList.append(card);
  }

  const resourceGroups = document.querySelector("#resource-groups");
  resourceGroups.replaceChildren();
  for (const group of overview.resourceGroups ?? []) {
    const section = document.createElement("section");
    section.className = "resource-group";
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    const links = document.createElement("div");
    links.className = "resource-links";
    for (const resource of group.items ?? []) {
      const link = document.createElement("a");
      link.href = resource.url;
      link.target = "_blank";
      link.rel = "noopener";
      const label = document.createElement("strong");
      label.textContent = resource.title;
      const kind = document.createElement("span");
      kind.textContent = resource.kind;
      link.append(label, kind);
      links.append(link);
    }
    section.append(heading, links);
    resourceGroups.append(section);
  }

  const policy = overview.screenshotPolicy ?? {};
  text("#screenshot-minimum", `${policy.minimumPerTutorial ?? 0}+ each`);
  const policyContainer = document.querySelector("#screenshot-policy");
  policyContainer.replaceChildren();
  for (const [titleText, values, tone] of [
    ["Must show", policy.requiredContext ?? [], "required"],
    ["Never capture", policy.neverCapture ?? [], "blocked"]
  ]) {
    const section = document.createElement("section");
    section.className = `policy-block ${tone}`;
    const heading = document.createElement("h3");
    heading.textContent = titleText;
    const list = document.createElement("ul");
    for (const value of values) {
      const item = document.createElement("li");
      item.textContent = value;
      list.append(item);
    }
    section.append(heading, list);
    policyContainer.append(section);
  }

  text("#accuracy-note", overview.accuracyNote);
}

async function loadDashboard() {
  try {
    const health = await getJson("/api/health");
    text("#sidebar-status", "Service online");
    document.querySelector("#sidebar-status-dot").classList.add("online");
    text("#network-pill", health.network);
    text("#metric-service", "Online");
    text("#metric-service-note", `${health.service} · v${health.version}`);
    text("#metric-network", health.network);
    text("#hero-version", health.version);
    text("#metric-formats", String(health.communityFormats?.length ?? 0));
  } catch (error) {
    text("#sidebar-status", "Service unavailable");
    text("#metric-service", "Offline");
    text("#metric-service-note", error instanceof Error ? error.message : String(error));
  }

  try {
    renderLearning(await getJson("/api/learning"));
  } catch (error) {
    text("#metric-learning", "Unavailable");
    text("#metric-learning-note", error instanceof Error ? error.message : String(error));
    const tracks = document.querySelector("#learning-tracks");
    tracks.replaceChildren();
    const errorCard = document.createElement("article");
    errorCard.className = "panel error-card";
    errorCard.textContent = error instanceof Error ? error.message : String(error);
    tracks.append(errorCard);
  }
}

loadDashboard();

// CKBuilder Passport product workflows -------------------------------------------------
let productConfig = { aiProviders: [], aiDefaultProvider: "openai", aiDefaultModel: "gpt-4.1-mini" };
let sessionAi = { apiKey: "", provider: "openai", model: "gpt-4.1-mini" };
let latestTrackedSubmission = null;

async function postJsonWithHeaders(url, body, headers = {}) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) { const error = new Error(value.message ?? value.error ?? "Request failed."); error.payload = value; throw error; }
  return value;
}
function aiRequestHeaders() {
  if (!sessionAi.apiKey) throw new Error("Enter an AI API key in Optional AI settings first.");
  return {
    "x-ai-api-key": sessionAi.apiKey,
    "x-ai-provider": sessionAi.provider || "auto",
    ...(sessionAi.model ? { "x-ai-model": sessionAi.model } : {})
  };
}
function submissionPayload() {
  return {
    applicantName: document.querySelector("#submission-name")?.value.trim(),
    applicantEmail: document.querySelector("#submission-email")?.value.trim(),
    recipientLockHash: document.querySelector("#submission-lock")?.value.trim(),
    credentialType: document.querySelector("#submission-type")?.value,
    credentialTitle: document.querySelector("#submission-title")?.value.trim(),
    category: document.querySelector("#submission-category")?.value.trim(),
    evidence: (document.querySelector("#submission-evidence")?.value ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
    notes: document.querySelector("#submission-notes")?.value.trim() ?? ""
  };
}
function renderPassport(passport) {
  const result = document.querySelector("#passport-result"); result.classList.remove("hidden");
  text("#passport-name", passport.displayName || "Anonymous builder"); text("#passport-lock-display", passport.recipientLockHash);
  text("#passport-active", passport.counts?.active ?? 0); text("#passport-revoked", passport.counts?.revoked ?? 0);
  const grid = document.querySelector("#passport-credentials"); grid.replaceChildren();
  for (const credential of passport.credentials ?? []) {
    const card = document.createElement("article"); card.className = "passport-card";
    const badge = document.createElement("span"); badge.className = "pill"; badge.textContent = credential.status;
    const title = document.createElement("h3"); title.textContent = credential.award?.title ?? credential.credentialId;
    const meta = document.createElement("p"); meta.textContent = `${credential.award?.field ?? "Credential"} · ${credential.award?.issuedAt ?? ""}`;
    const issuer = document.createElement("small"); issuer.textContent = `Issued by ${credential.issuer?.name ?? "Unknown issuer"}`;
    const id = document.createElement("code"); id.textContent = credential.credentialId;
    const actions = document.createElement("div"); actions.className = "credential-actions";
    const verify = document.createElement("button"); verify.type = "button"; verify.className = "button ghost small"; verify.textContent = "Verify";
    verify.addEventListener("click", () => { document.querySelector("#credential-id").value = credential.credentialId; activateView("inspector"); document.querySelector("#credential-id").focus(); });
    const download = document.createElement("a"); download.className = "button ghost small"; download.href = `/api/certificate/${encodeURIComponent(credential.credentialId)}`; download.target = "_blank"; download.rel = "noopener"; download.textContent = "Credential JSON";
    const html = document.createElement("a"); html.className = "button ghost small"; html.href = `/api/certificate/${encodeURIComponent(credential.credentialId)}/html`; html.target = "_blank"; html.rel = "noopener"; html.textContent = "HTML certificate";
    const qr = document.createElement("a"); qr.className = "button ghost small"; qr.href = `/api/qr?credentialId=${encodeURIComponent(credential.credentialId)}`; qr.target = "_blank"; qr.rel = "noopener"; qr.textContent = "QR";
    actions.append(verify, download, html, qr); card.append(badge, title, meta, issuer, document.createElement("br"), id, actions); grid.append(card);
  }
  if (!(passport.credentials ?? []).length) { const empty = document.createElement("article"); empty.className = "empty-state"; empty.textContent = "No public credentials are attached to this Lock Script hash yet."; grid.append(empty); }
}

document.querySelector("#passport-form")?.addEventListener("submit", async (event) => {
  event.preventDefault(); const status = document.querySelector("#passport-status");
  try { setFormStatus(status, "Loading public credentials…"); const lock = document.querySelector("#passport-lock").value.trim(); renderPassport(await getJson(`/api/passport/${encodeURIComponent(lock)}`)); setFormStatus(status, "Passport loaded.", "success"); }
  catch (error) { setFormStatus(status, error.message, "error"); }
});

async function uploadSelectedSubmissionFiles(submissionId, trackingToken) {
  const input = document.querySelector("#submission-files"); const files = [...(input?.files ?? [])];
  if (files.length > 10) throw new Error("Choose at most 10 evidence files.");
  const uploaded = [];
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is larger than 5 MB.`);
    uploaded.push(await postJson(`/api/submissions/${encodeURIComponent(submissionId)}/attachments`, { trackingToken, ...(await fileDocumentPayload(file)) }));
  }
  return uploaded;
}

document.querySelector("#submission-form")?.addEventListener("submit", async (event) => {
  event.preventDefault(); const status = document.querySelector("#submission-status"); const button = event.submitter;
  setButtonBusy(button, true, "Submitting…");
  try {
    const created = await postJson("/api/submissions", submissionPayload());
    document.querySelector("#tracking-id").value = created.id; document.querySelector("#tracking-token").value = created.trackingToken;
    try { localStorage.setItem(`ckbuilder-submission-${created.id}`, created.trackingToken); } catch {}
    setFormStatus(status, `Submission created. Save ID ${created.id} and tracking token ${created.trackingToken}. Uploading selected files…`, "success");
    let uploaded = [];
    try { uploaded = await uploadSelectedSubmissionFiles(created.id, created.trackingToken); }
    catch (uploadError) { setFormStatus(status, `Submission ${created.id} was created and remains trackable, but one or more file uploads failed: ${uploadError.message}`, "error"); await refreshTrackedSubmission(); return; }
    setFormStatus(status, `Submitted${uploaded.length ? ` with ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}` : ""}. Save ID ${created.id} and tracking token ${created.trackingToken}`, "success");
    await refreshTrackedSubmission();
  } catch (error) { setFormStatus(status, error.message, "error"); }
  finally { setButtonBusy(button, false); }
});

document.querySelector("#ai-triage-submission")?.addEventListener("click", async (event) => {
  const status = document.querySelector("#submission-status"); const output = document.querySelector("#submission-ai-output"); setButtonBusy(event.currentTarget, true, "Analyzing…");
  try { const result = await postJsonWithHeaders("/api/ai/evidence", submissionPayload(), aiRequestHeaders()); output.textContent = result.text; setFormStatus(status, `AI pre-check from ${result.provider}/${result.model}. Human review is still required.`, "success"); }
  catch (error) { setFormStatus(status, error.message, "error"); } finally { setButtonBusy(event.currentTarget, false); }
});

function renderTracking(item) {
  latestTrackedSubmission = item;
  if (document.querySelector("#submission-evidence")) document.querySelector("#submission-evidence").value = (item.evidence ?? []).join("\n");
  if (document.querySelector("#submission-notes")) document.querySelector("#submission-notes").value = item.notes ?? "";
  if (document.querySelector("#submission-name")) document.querySelector("#submission-name").value = item.applicant_name ?? document.querySelector("#submission-name").value;
  if (document.querySelector("#submission-lock")) document.querySelector("#submission-lock").value = item.recipient_lock_hash ?? document.querySelector("#submission-lock").value;
  if (document.querySelector("#submission-title")) document.querySelector("#submission-title").value = item.credential_title ?? document.querySelector("#submission-title").value;
  if (document.querySelector("#submission-category")) document.querySelector("#submission-category").value = item.category ?? document.querySelector("#submission-category").value;
  const details = document.querySelector("#tracking-details"); const timeline = document.querySelector("#tracking-timeline");
  details?.classList.remove("hidden"); timeline?.replaceChildren();
  const attachmentList = document.querySelector("#tracking-attachments"); attachmentList?.replaceChildren();
  for (const attachment of item.attachments ?? []) {
    const li = document.createElement("li"); const meta = document.createElement("div"); meta.className = "attachment-meta";
    const strong = document.createElement("strong"); strong.textContent = attachment.fileName; const small = document.createElement("small"); small.textContent = `${attachment.mimeType} · ${Math.ceil(attachment.byteLength / 1024)} KB · SHA-256 ${attachment.sha256.slice(0, 16)}…`; meta.append(strong, small); li.append(meta);
    if (["SUBMITTED","CHANGES_REQUESTED"].includes(item.status)) { const remove = document.createElement("button"); remove.type="button"; remove.className="button danger small"; remove.textContent="Remove"; remove.addEventListener("click", async()=>{ const id=document.querySelector("#tracking-id").value.trim(), token=document.querySelector("#tracking-token").value.trim(); try { await requestJson(`/api/submissions/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachment.id)}`, "DELETE", {trackingToken:token}); await refreshTrackedSubmission(); } catch(error) { setFormStatus(document.querySelector("#tracking-status"), error.message, "error"); } }); li.append(remove); }
    attachmentList?.append(li);
  }
  if (!(item.attachments ?? []).length && attachmentList) { const li=document.createElement("li"); li.textContent="No uploaded evidence files."; attachmentList.append(li); }
  for (const event of item.timeline ?? []) { const li=document.createElement("li"); const marker=document.createElement("span"); marker.className="history-marker"; const box=document.createElement("div"); const strong=document.createElement("strong"); strong.textContent=event.event_type; const small=document.createElement("small"); small.textContent=`${event.actor} · ${new Date(event.created_at).toLocaleString()}`; box.append(strong,small); if(event.detail?.reviewerNotes){const p=document.createElement("p");p.textContent=event.detail.reviewerNotes;box.append(p)} li.append(marker,box); timeline.append(li); }
  document.querySelector("#tracking-resubmit")?.classList.toggle("hidden", item.status !== "CHANGES_REQUESTED");
  document.querySelector("#tracking-cancel")?.classList.toggle("hidden", !["SUBMITTED","CHANGES_REQUESTED"].includes(item.status));
}
async function refreshTrackedSubmission() {
  const id = document.querySelector("#tracking-id").value.trim(); const token = document.querySelector("#tracking-token").value.trim();
  const item = await getJson(`/api/submissions/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`); renderTracking(item); return item;
}
document.querySelector("#tracking-form")?.addEventListener("submit", async (event) => {
  event.preventDefault(); const status = document.querySelector("#tracking-status");
  try { const item=await refreshTrackedSubmission(); setFormStatus(status, `${item.status}${item.issued_credential_id ? ` · credential ${item.issued_credential_id}` : ""}${item.reviewer_notes ? ` · ${item.reviewer_notes}` : ""}`, item.status === "ISSUED" ? "success" : "neutral"); }
  catch (error) { setFormStatus(status, error.message, "error"); }
});
document.querySelector("#tracking-resubmit")?.addEventListener("click", async (event) => {
  const status=document.querySelector("#tracking-status"); setButtonBusy(event.currentTarget,true,"Resubmitting…");
  try { const id=document.querySelector("#tracking-id").value.trim(), token=document.querySelector("#tracking-token").value.trim(); const payload=submissionPayload(); const uploaded=await uploadSelectedSubmissionFiles(id,token); await postJson(`/api/submissions/${encodeURIComponent(id)}/resubmit`,{trackingToken:token,evidence:payload.evidence,notes:payload.notes}); setFormStatus(status,`Updated evidence resubmitted${uploaded.length ? ` with ${uploaded.length} new file${uploaded.length===1?"":"s"}` : ""} for human review.`,"success"); await refreshTrackedSubmission(); } catch(error){setFormStatus(status,error.message,"error")} finally{setButtonBusy(event.currentTarget,false)}
});
document.querySelector("#tracking-cancel")?.addEventListener("click", async (event) => {
  if(!confirm("Cancel this submission? This cannot be reviewed unless you create a new submission.")) return; const status=document.querySelector("#tracking-status"); setButtonBusy(event.currentTarget,true,"Cancelling…");
  try { const id=document.querySelector("#tracking-id").value.trim(), token=document.querySelector("#tracking-token").value.trim(); await postJson(`/api/submissions/${encodeURIComponent(id)}/cancel`,{trackingToken:token}); setFormStatus(status,"Submission cancelled.","success"); await refreshTrackedSubmission(); } catch(error){setFormStatus(status,error.message,"error")} finally{setButtonBusy(event.currentTarget,false)}
});

document.querySelector("#ai-explain")?.addEventListener("click", async (event) => {
  if (!latestProof) return; setButtonBusy(event.currentTarget, true, "Explaining…");
  try { const result = await postJsonWithHeaders("/api/ai/explain", { proof: latestProof }, aiRequestHeaders()); text("#ai-explanation", result.text); document.querySelector("#ai-explanation-panel").classList.remove("hidden"); }
  catch (error) { text("#ai-explanation", error.message); document.querySelector("#ai-explanation-panel").classList.remove("hidden"); } finally { setButtonBusy(event.currentTarget, false); }
});

document.querySelector("#tutor-form")?.addEventListener("submit", async (event) => {
  event.preventDefault(); const status = document.querySelector("#tutor-status"); const output = document.querySelector("#tutor-output"); const button = event.submitter; setButtonBusy(button, true, "Thinking…");
  try { const question = document.querySelector("#tutor-question").value.trim(); const result = await postJsonWithHeaders("/api/ai/tutor", { question }, aiRequestHeaders()); output.textContent = result.text; output.classList.remove("hidden"); setFormStatus(status, `${result.provider}/${result.model}`, "success"); }
  catch (error) { setFormStatus(status, error.message, "error"); } finally { setButtonBusy(button, false); }
});

function renderDirectory(result) {
  const box=document.querySelector("#directory-results"); box?.replaceChildren();
  for(const credential of result.items??[]){const card=document.createElement("article");card.className="passport-card";const badge=document.createElement("span");badge.className="pill";badge.textContent=credential.status;const h=document.createElement("h3");h.textContent=credential.award?.title??credential.credentialId;const p=document.createElement("p");p.textContent=`${credential.displayName??"Anonymous builder"} · ${credential.credentialType}`;const code=document.createElement("code");code.textContent=credential.credentialId;const btn=document.createElement("button");btn.type="button";btn.className="button ghost small";btn.textContent="Verify";btn.onclick=()=>{document.querySelector("#credential-id").value=credential.credentialId;activateView("inspector")};card.append(badge,h,p,code,btn);box.append(card)}
  if(!(result.items??[]).length){const empty=document.createElement("article");empty.className="empty-state";empty.textContent="No matching public credentials.";box?.append(empty)}
  setFormStatus(document.querySelector("#directory-status-text"),`${result.total} matching public credential${result.total===1?"":"s"}.`,"success");
}
async function searchDirectory(){const params=new URLSearchParams();const q=document.querySelector("#directory-query")?.value.trim();const type=document.querySelector("#directory-type")?.value.trim();const status=document.querySelector("#directory-status")?.value;const limit=document.querySelector("#directory-limit")?.value;if(q)params.set("q",q);if(type)params.set("type",type);if(status)params.set("status",status);if(limit)params.set("limit",limit);renderDirectory(await getJson(`/api/directory?${params}`))}
document.querySelector("#directory-form")?.addEventListener("submit",async(event)=>{event.preventDefault();try{setFormStatus(document.querySelector("#directory-status-text"),"Searching…");await searchDirectory()}catch(error){setFormStatus(document.querySelector("#directory-status-text"),error.message,"error")}});

async function loadProductConfig() {
  try {
    productConfig = await getJson("/api/config"); sessionAi.provider = productConfig.aiDefaultProvider ?? "openai"; sessionAi.model = productConfig.aiDefaultModel ?? "gpt-4.1-mini";
    document.querySelector("#directory-nav")?.classList.toggle("hidden", productConfig.publicDirectoryEnabled !== true);
    if (productConfig.publicDirectoryEnabled === true) { setFormStatus(document.querySelector("#directory-status-text"), "Public directory enabled by this deployment.", "neutral"); }
    else { setFormStatus(document.querySelector("#directory-status-text"), "Public directory is disabled by this deployment.", "neutral"); }
    try { const remembered = JSON.parse(sessionStorage.getItem("ckbuilder-ai-settings") ?? "null"); if (remembered) sessionAi = { ...sessionAi, ...remembered, apiKey: "" }; } catch {}
    const select = document.querySelector("#ai-provider"); select.replaceChildren();
    for (const provider of productConfig.aiProviders ?? []) { const option = document.createElement("option"); option.value = provider.id; option.textContent = provider.name; select.append(option); }
    if (![...select.options].some((option) => option.value === sessionAi.provider)) sessionAi.provider = productConfig.aiDefaultProvider ?? "openai";
    select.value = sessionAi.provider; document.querySelector("#ai-model").value = sessionAi.model;
    const agentSelect = document.querySelector("#ai-agent");
    for (const agent of productConfig.aiAgents ?? []) { const option = document.createElement("option"); option.value = agent.id; option.textContent = agent.name; option.title = agent.description ?? ""; agentSelect?.append(option); }
    const pluginList = document.querySelector("#ai-plugin-list"); pluginList?.replaceChildren();
    for (const plugin of productConfig.aiPlugins ?? []) {
      const label = document.createElement("label"); label.className = "plugin-option";
      const check = document.createElement("input"); check.type = "checkbox"; check.value = plugin.id; check.dataset.aiPlugin = "1"; check.checked = plugin.enabledByDefault === true;
      const text = document.createElement("span"); const title = document.createElement("strong"); title.textContent = plugin.name; const meta = document.createElement("small"); meta.textContent = `${plugin.description} · ${plugin.trust} · ${(plugin.permissions ?? []).join(", ")}`; text.append(title, meta); label.append(check, text); pluginList?.append(label);
    }
    if (productConfig.aiEnabled === false) { document.querySelector("#ai-settings-panel")?.classList.add("hidden"); document.querySelector("#ai-agent-panel")?.classList.add("hidden"); }
  } catch (error) { setFormStatus(document.querySelector("#ai-settings-status"), error.message, "error"); }
}

document.querySelector("#ai-provider")?.addEventListener("change", (event) => {
  const provider = (productConfig.aiProviders ?? []).find((item) => item.id === event.currentTarget.value);
  const model = document.querySelector("#ai-model");
  if (model && provider) model.value = provider.defaultModel ?? "";
});

document.querySelector("#save-ai-settings")?.addEventListener("click", () => {
  sessionAi.provider = document.querySelector("#ai-provider").value; sessionAi.model = document.querySelector("#ai-model").value.trim(); sessionAi.apiKey = document.querySelector("#ai-key").value.trim();
  try { sessionStorage.setItem("ckbuilder-ai-settings", JSON.stringify({ provider: sessionAi.provider, model: sessionAi.model })); } catch {}
  setFormStatus(document.querySelector("#ai-settings-status"), sessionAi.apiKey ? "AI enabled for this browser tab. The API key was not persisted." : "Provider/model saved; AI remains off until you enter a key.", "success");
});

document.querySelector("#ai-agent-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#ai-agent-status");
  const output = document.querySelector("#ai-agent-output");
  const button = event.submitter;
  setButtonBusy(button, true, "Running…");
  try {
    const task = document.querySelector("#ai-agent-task").value.trim();
    if (!task) throw new Error("Enter a task for the CKB agent.");
    const rawContext = document.querySelector("#ai-agent-context").value.trim();
    let context = rawContext ? { raw: rawContext } : undefined;
    if (rawContext && /^[\[{]/.test(rawContext)) { try { context = JSON.parse(rawContext); } catch {} }
    const plugins = [...document.querySelectorAll("[data-ai-plugin='1']:checked")].map((item) => item.value);
    const maxSteps = Number(document.querySelector("#ai-agent-max-steps")?.value ?? 4);
    const payload = { agent: document.querySelector("#ai-agent").value, task, context, plugins, maxSteps };
    let result = await postJsonWithHeaders("/api/ai/agent", payload, aiRequestHeaders());
    if (result.approvalRequired) {
      const approval = result.approvalRequired;
      const approved = window.confirm(`Community plugin ${approval.pluginId} requests tool ${approval.tool}.

Arguments:
${JSON.stringify(approval.arguments ?? {}, null, 2)}

This tool was not marked read-only by its MCP server. Run it once for this task?`);
      if (approved) result = await postJsonWithHeaders("/api/ai/agent", { ...payload, approvedTools: [approval.tool] }, aiRequestHeaders());
    }
    output.textContent = result.text; output.classList.remove("hidden");
    const trace = document.querySelector("#ai-agent-trace"); trace?.replaceChildren();
    if ((result.toolTrace ?? []).length) {
      const heading = document.createElement("h3"); heading.textContent = "Agent tool audit"; trace.append(heading);
      for (const item of result.toolTrace) { const row = document.createElement("div"); row.className = "trace-row"; const step = document.createElement("span"); step.textContent = `#${item.step}`; const tool = document.createElement("code"); tool.textContent = item.tool; const plugin = document.createElement("span"); plugin.textContent = item.pluginId; const state = document.createElement("span"); state.textContent = item.status; row.append(step, tool, plugin, state); trace.append(row); }
      trace.classList.remove("hidden");
    } else trace?.classList.add("hidden");
    const pluginSummary = (result.plugins ?? []).map((plugin) => plugin.id).join(", ") || "no plugins";
    setFormStatus(status, `${result.agentName} · ${result.provider}/${result.model} · ${result.steps} step(s) · ${pluginSummary}`, result.approvalRequired ? "neutral" : "success");
  } catch (error) { setFormStatus(status, error.message, "error"); }
  finally { setButtonBusy(button, false); }
});

loadProductConfig();
const verifyParam = new URLSearchParams(location.search).get("credentialId");
if (verifyParam) { const field = document.querySelector("#credential-id"); if (field) field.value = verifyParam; activateView("inspector", false); }
document.querySelector("#check-submission")?.addEventListener("click", async (event) => {
  const status = document.querySelector("#submission-status"); const output = document.querySelector("#submission-ai-output"); setButtonBusy(event.currentTarget, true, "Checking…");
  try { const result = await postJson("/api/evidence/check", submissionPayload()); output.textContent = JSON.stringify(result, null, 2); setFormStatus(status, "Deterministic GitHub/CKB reference checks complete.", "success"); }
  catch (error) { setFormStatus(status, error.message, "error"); } finally { setButtonBusy(event.currentTarget, false); }
});

document.querySelector("#inspect-document")?.addEventListener("click", async (event) => {
  const file = document.querySelector("#document")?.files?.[0]; const status = document.querySelector("#status"); const output = document.querySelector("#document-info"); const preview = document.querySelector("#document-html-preview");
  if (!file) { setFormStatus(status, "Choose a document first.", "error"); return; }
  setButtonBusy(event.currentTarget, true, "Inspecting…");
  try { const result = await postJson("/api/document/inspect", await fileDocumentPayload(file)); const display = { fileName: result.fileName, mimeType: result.mimeType, byteLength: result.byteLength, sha256: result.sha256, textExtracted: result.textExtracted, visibleTextLength: result.visibleTextLength, textExcerpt: result.textExcerpt }; output.textContent = JSON.stringify(display, null, 2); output.classList.remove("hidden"); if (preview) { if (result.safeHtml) { preview.srcdoc = result.safeHtml; preview.classList.remove("hidden"); } else { preview.removeAttribute("srcdoc"); preview.classList.add("hidden"); } } setFormStatus(status, "Document inspected locally by the CKBuilder server. No AI was used.", "success"); }
  catch(error){ setFormStatus(status,error.message,"error"); } finally { setButtonBusy(event.currentTarget,false); }
});

document.querySelector("#ai-read-document")?.addEventListener("click", async (event) => {
  const file = document.querySelector("#document")?.files?.[0]; const status = document.querySelector("#status"); const output = document.querySelector("#ai-document-output");
  if (!file) { setFormStatus(status, "Choose an HTML/TXT/Markdown/JSON document or PNG/JPEG/WebP image first.", "error"); return; }
  setButtonBusy(event.currentTarget, true, "Reading…");
  try { const result = await postJsonWithHeaders("/api/ai/document", await fileDocumentPayload(file), aiRequestHeaders()); output.textContent = result.text; output.classList.remove("hidden"); setFormStatus(status, "AI extracted visible fields only. Run deterministic verification separately.", "success"); }
  catch (error) { setFormStatus(status, error.message, "error"); } finally { setButtonBusy(event.currentTarget, false); }
});
