import fs from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";

const SOLUTION_MARKERS = /\b(?:TODO|FIXME)\b|\?\?\?/i;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new AppError("LEARNING_MANIFEST_INVALID", `Cannot read learning manifest: ${filePath}`, {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

function filesRecursively(directory, extension) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesRecursively(absolute, extension));
    if (entry.isFile() && (!extension || entry.name.endsWith(extension))) files.push(absolute);
  }
  return files.sort();
}

function academyCompletion(directory) {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory).filter((name) => /^module-\d{2}\.md$/i.test(name)).length;
}

function evidenceCompletion(directory, expectedFiles = []) {
  return expectedFiles.filter((name) => {
    const filePath = path.join(directory, name);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    const text = fs.readFileSync(filePath, "utf8");
    return text.trim().length > 0 && !/YYYY-MM-DD|0x\.\.\.|What I learned:\s*$/m.test(text);
  }).length;
}

function readLearningCatalog(rootDir) {
  const catalogPath = path.join(rootDir, "learning", "catalog.json");
  const catalog = readJson(catalogPath);
  if (!["ckbuilder-learning-catalog/v1", "ckbuilder-learning-catalog/v2"].includes(catalog.schema)
      || !Array.isArray(catalog.basicTutorials)
      || !Array.isArray(catalog.resourceGroups)
      || (catalog.schema === "ckbuilder-learning-catalog/v2" && !Array.isArray(catalog.curriculumModules))) {
    throw new AppError("LEARNING_CATALOG_INVALID", "learning/catalog.json has an unsupported structure.");
  }
  return catalog;
}

function cellModelCompletion(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, "utf8");
  const numberedAnswers = text.match(/^##\s+(?:Answer\s+)?[1-8](?:\.|:|\s)/gim) ?? [];
  return new Set(numberedAnswers.map((heading) => heading.match(/[1-8]/)?.[0])).size;
}

function trackState(completed, total) {
  if (completed >= total) return "complete";
  if (completed > 0) return "in-progress";
  return "pending";
}

function relative(rootDir, absolute) {
  return path.relative(rootDir, absolute).split(path.sep).join("/");
}

export function buildLearningOverview(rootDir = process.cwd()) {
  const manifestPath = path.join(rootDir, "learning", "progress.json");
  const manifest = readJson(manifestPath);
  const catalog = readLearningCatalog(rootDir);
  if (manifest.schema !== "ckbuilder-learning-progress/v1" || !Array.isArray(manifest.tracks)) {
    throw new AppError("LEARNING_MANIFEST_INVALID", "learning/progress.json has an unsupported structure.");
  }

  const rustDirectory = path.join(rootDir, "learning", "rustlings-solved");
  const rustFiles = filesRecursively(rustDirectory, ".rs");
  const unresolvedRustFiles = rustFiles.filter((file) => SOLUTION_MARKERS.test(fs.readFileSync(file, "utf8")));

  const tracks = manifest.tracks.map((track) => {
    let completed = 0;
    if (track.id === "rustlings") completed = rustFiles.length - unresolvedRustFiles.length;
    if (track.id === "academy") completed = academyCompletion(path.join(rootDir, track.location));
    if (Array.isArray(track.expectedFiles)) completed = evidenceCompletion(path.join(rootDir, track.location), track.expectedFiles);
    if (track.id === "cell-model") completed = cellModelCompletion(path.join(rootDir, track.location));

    const total = Number(track.total);
    const boundedCompleted = Math.max(0, Math.min(total, completed));
    return {
      id: track.id,
      label: track.label,
      description: track.description,
      location: track.location,
      completed: boundedCompleted,
      total,
      percent: total > 0 ? Math.round((boundedCompleted / total) * 100) : 0,
      state: trackState(boundedCompleted, total)
    };
  });

  const completedModuleIds = new Set((catalog.curriculumModules ?? [])
    .filter((module) => evidenceCompletion(rootDir, [module.completionFile]) === 1)
    .map((module) => module.id));
  const curriculum = (catalog.curriculumModules ?? []).map((module) => {
    const complete = completedModuleIds.has(module.id);
    const prerequisites = Array.isArray(module.prerequisites) ? module.prerequisites : [];
    const prerequisitesComplete = prerequisites.every((id) => completedModuleIds.has(id));
    return {
      ...module,
      completed: complete,
      state: complete ? "complete" : prerequisitesComplete ? "available" : "planned",
      missingPrerequisites: prerequisites.filter((id) => !completedModuleIds.has(id)),
      quizCommand: `npm run learning:quiz -- ${module.id}`
    };
  });
  const nextModule = curriculum.find((module) => !module.completed && module.state === "available")
    ?? curriculum.find((module) => !module.completed)
    ?? null;
  const curriculumMinutes = curriculum.reduce((sum, module) => sum + Number(module.estimatedMinutes || 0), 0);
  const categories = [...new Set(curriculum.map((module) => module.category))].map((category) => ({
    category,
    total: curriculum.filter((module) => module.category === category).length,
    completed: curriculum.filter((module) => module.category === category && module.completed).length
  }));

  const completed = tracks.reduce((sum, track) => sum + track.completed, 0);
  const total = tracks.reduce((sum, track) => sum + track.total, 0);
  const pending = tracks
    .filter((track) => track.state !== "complete")
    .map((track) => `${track.label}: ${track.total - track.completed} item${track.total - track.completed === 1 ? "" : "s"} remaining`);

  return {
    schema: manifest.schema,
    title: manifest.title,
    updatedAt: manifest.updatedAt,
    summary: {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      completeTracks: tracks.filter((track) => track.state === "complete").length,
      totalTracks: tracks.length
    },
    tracks,
    validation: {
      rustSourceFiles: rustFiles.length,
      rustSolutionsClean: unresolvedRustFiles.length === 0,
      unresolvedRustFiles: unresolvedRustFiles.map((file) => relative(rootDir, file))
    },
    pending,
    technicalMilestones: manifest.technicalMilestones ?? [],
    tutorials: catalog.basicTutorials,
    curriculum,
    curriculumSummary: {
      completed: curriculum.filter((module) => module.completed).length,
      total: curriculum.length,
      percent: curriculum.length > 0 ? Math.round(curriculum.filter((module) => module.completed).length / curriculum.length * 100) : 0,
      estimatedMinutes: curriculumMinutes,
      estimatedHours: Math.round(curriculumMinutes / 6) / 10,
      nextModule,
      categories
    },
    studyPlan: catalog.studyPlan ?? null,
    resourceGroups: catalog.resourceGroups,
    screenshotPolicy: catalog.screenshotPolicy,
    accuracyNote: completed >= total
      ? "All repository-tracked learning items have completion records. This is a CKBuilder repository progress state; live Testnet transactions or external course certificates are only claimed when the corresponding evidence record actually contains them."
      : "Official tutorials and curriculum modules remain pending until a completed evidence record exists. Reading, quizzes, and local practice are intentionally tracked separately."
  };
}
