import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatMoney } from '../core/money';
import { readPhotoBase64 } from '../storage/photos';
import type { Job } from '../types';
import { buildRecord } from './holdproof';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

async function img(fileName: string | undefined): Promise<string> {
  if (!fileName) return '<p>Not available</p>';
  try {
    return `<img src="data:image/jpeg;base64,${await readPhotoBase64(fileName)}" style="width:100%;border-radius:8px"/>`;
  } catch {
    return '<p>Photo file missing</p>';
  }
}

export async function exportPdf(job: Job): Promise<void> {
  const passed = [...job.attempts].reverse().find((a) => a.executed) ?? job.attempts[job.attempts.length - 1];
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:-apple-system,Roboto,sans-serif;color:#0E1A2B;padding:24px;font-size:12px}
    h1{font-size:22px;margin:0} h2{font-size:14px;margin-top:20px;border-bottom:1px solid #E3E8EF;padding-bottom:4px}
    .mono{font-family:monospace;word-break:break-all} td{padding:3px 8px 3px 0;vertical-align:top}
    .ok{color:#1F9D6B} .bad{color:#D9534F} .grid{display:flex;gap:12px} .grid div{flex:1}
    .note{background:#EEEBFB;padding:8px;border-radius:6px}
  </style></head><body>
  <p class="note">HoldProof evidence record — PayPal Sandbox hackathon demonstration. Not a production payment record.</p>
  <h1>${esc(job.title)}</h1><p>${esc(job.description)}</p>
  <table><tr><td>Amount</td><td>${formatMoney(job.amount)}</td></tr>
  <tr><td>Evidence digest</td><td class="mono">${job.digest ?? ''}</td></tr>
  <tr><td>PayPal order</td><td class="mono">${job.orderId ?? ''}</td></tr>
  <tr><td>Authorization</td><td class="mono">${job.authorizationId ?? ''}</td></tr>
  <tr><td>Capture</td><td class="mono">${job.captureId ?? ''}</td></tr>
  <tr><td>Last PayPal status</td><td>${esc(JSON.stringify(job.paypalStatus))}</td></tr></table>
  <h2>Agreed criteria</h2><ol>${job.criteria.map((c) => `<li>${esc(c.text)}</li>`).join('')}</ol>
  <h2>Photos</h2><div class="grid"><div><b>BEFORE</b> ${job.before ? esc(job.before.capturedAt) : ''}${await img(job.before?.fileName)}
  <p class="mono">sha256 (of the base64 text of the JPEG) ${job.before?.sha256 ?? ''}</p></div>
  <div><b>AFTER</b> ${passed ? esc(passed.after.capturedAt) : ''}${await img(passed?.after.fileName)}
  <p class="mono">sha256 (of the base64 text of the JPEG) ${passed?.after.sha256 ?? ''}</p></div></div>
  <h2>Verdict</h2>${passed ? `
  <p><b>Proposer:</b> ${passed.proposal ? esc(passed.proposal.overall + ' — ' + passed.proposal.summary) : esc(passed.proposalError ?? '')}</p>
  <ul>${(passed.proposal?.criteria ?? []).map((c) => `<li class="${c.pass ? 'ok' : 'bad'}">${esc(c.id)}: ${c.pass ? 'PASS' : 'FAIL'} — ${esc(c.reason)}</li>`).join('')}</ul>
  <p><b>Critic:</b> ${passed.critique ? esc(passed.critique.summary) : esc(passed.critiqueError ?? '')}</p>
  <p><b>Judge checks:</b></p><ul>${passed.decision.checks.map((c) => `<li class="${c.ok ? 'ok' : 'bad'}">${esc(c.label)} — ${esc(c.detail)}</li>`).join('')}</ul>` : '<p>No verdict yet.</p>'}
  <h2>Timeline</h2><ul>${job.log.map((l) => `<li>${esc(l.at)} [${l.kind}] ${esc(l.message)}</li>`).join('')}</ul>
  <h2>Canonical record (hashed into the digest)</h2><p class="mono">${esc(job.canonical ?? '')}</p>
  </body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share evidence record' });
}

export async function exportJson(job: Job): Promise<void> {
  const file = new File(Paths.cache, `holdproof-${job.id}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(buildRecord(job), null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Share evidence record (JSON)' });
}
