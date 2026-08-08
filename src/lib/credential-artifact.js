import { publicCredentialSummary } from "./passport-service.js";

function vcType(value) { const clean = String(value ?? "Credential").replace(/[^A-Za-z0-9]/g, " ").trim().split(/\s+/).filter(Boolean).map((x) => x[0]?.toUpperCase() + x.slice(1)).join(""); return `${clean || "Builder"}Credential`; }

export function portableCredential(record, publicBaseUrl = "") {
  const c = publicCredentialSummary(record);
  if (!c) return null;
  const base = String(publicBaseUrl || "").replace(/\/$/, "");
  const verifyUrl = base ? `${base}/?credentialId=${encodeURIComponent(c.credentialId)}#inspector` : null;
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: base ? `${base}/api/certificate/${encodeURIComponent(c.credentialId)}` : `urn:ckbuilder:credential:${c.credentialId}`,
    type: ["VerifiableCredential", "CKBuilderCredential", vcType(c.credentialType)],
    issuer: { id: `urn:ckb:issuer:${c.issuer.issuerId}`, name: c.issuer.name },
    validFrom: `${c.award.issuedAt}T00:00:00Z`,
    credentialSubject: {
      id: `urn:ckb:lock-hash:${c.subject.recipientLockHash}`,
      achievement: { name: c.award.title, category: c.award.field, classification: c.award.classification }
    },
    credentialStatus: {
      id: verifyUrl ?? `urn:ckbuilder:verify:${c.credentialId}`,
      type: "CKBCellCredentialStatus",
      status: c.status,
      issuerLockHash: c.issuer.lockHash
    },
    evidence: [{ type: "DocumentHashEvidence", digestAlgorithm: c.document.hashAlgorithm, digestValue: c.document.hash }],
    ckbuilderProof: {
      type: "Ed25519SignedCredentialRecord",
      payloadSchema: record.payload.schema,
      issuerPublicKeyPem: record.issuerPublicKeyPem,
      signature: record.signature,
      signedPayload: record.payload
    },
    ckbuilderVerificationUrl: verifyUrl
  };
}
