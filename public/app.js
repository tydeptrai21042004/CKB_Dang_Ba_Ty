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
