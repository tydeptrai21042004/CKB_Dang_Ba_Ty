const TX_RE = /0x[0-9a-fA-F]{64}/g;
const GITHUB_RE = /^https:\/\/github\.com\/([^/\s]+)\/([^/#?\s]+)(?:[\/#?].*)?$/i;

function unique(values) { return [...new Set(values)]; }
function evidenceText(input) { return [...(input.evidence ?? []), input.notes ?? ""].join("\n"); }

async function checkCkbTransaction(rpcUrl, txHash) {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "get_transaction", params: [txHash] }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { kind: "ckb_transaction", value: txHash, ok: false, status: `HTTP_${response.status}` };
    const body = await response.json(); const status = body?.result?.tx_status?.status ?? body?.result?.txStatus?.status ?? null;
    return { kind: "ckb_transaction", value: txHash, ok: status === "committed", status: status ?? (body?.result ? "found" : "not_found") };
  } catch { return { kind: "ckb_transaction", value: txHash, ok: null, status: "rpc_unavailable" }; }
}

async function checkGithub(url) {
  const match = String(url).match(GITHUB_RE); if (!match) return null;
  const owner = match[1]; const repo = match[2].replace(/\.git$/i, "");
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "ckbuilder-passport" }, signal: AbortSignal.timeout(8000)
    });
    if (response.status === 404) return { kind: "github_repository", value: `https://github.com/${owner}/${repo}`, ok: false, status: "not_found" };
    if (!response.ok) return { kind: "github_repository", value: `https://github.com/${owner}/${repo}`, ok: null, status: `HTTP_${response.status}` };
    const body = await response.json();
    return { kind: "github_repository", value: body.html_url, ok: true, status: body.archived ? "archived" : "accessible", metadata: { defaultBranch: body.default_branch, language: body.language, forks: body.forks_count, stars: body.stargazers_count } };
  } catch { return { kind: "github_repository", value: `https://github.com/${owner}/${repo}`, ok: null, status: "unavailable" }; }
}

export async function verifyEvidenceReferences(config, submission) {
  const text = evidenceText(submission);
  const txHashes = unique(text.match(TX_RE) ?? []).slice(0, 8);
  const githubUrls = unique((submission.evidence ?? []).filter((value) => GITHUB_RE.test(String(value)))).slice(0, 8);
  const ckb = await Promise.all(txHashes.map((hash) => checkCkbTransaction(config.CKB_RPC_URL, hash)));
  const github = (await Promise.all(githubUrls.map(checkGithub))).filter(Boolean);
  return {
    schema: "ckbuilder-evidence-checks/v1", checkedAt: new Date().toISOString(),
    summary: {
      referencedCkbTransactions: txHashes.length, committedCkbTransactions: ckb.filter((x) => x.ok === true).length,
      githubRepositories: githubUrls.length, accessibleGithubRepositories: github.filter((x) => x.ok === true).length
    },
    checks: [...ckb, ...github]
  };
}
