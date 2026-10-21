import React, { useEffect, useRef, useState } from "react";
import {
  cloudConfiguration, getCloudClient, inspectCloudLibrary, downloadCloudLibrary,
  uploadCloudLibrary, preserveLocalLibrary, getRecoveryLibrary, snapshotLibrary,
} from "./lib/cloud.js";
import "./cloud.css";

function exportBackup(library) {
  const blob = new Blob([JSON.stringify(library, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `coderecall-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dateLabel = (value) => value ? new Date(value).toLocaleString() : "Never uploaded";
const counts = (library) => `${library.nodes.filter(node => node.type === "file").length} files · ${library.nodes.filter(node => node.type === "folder").length} folders · ${library.tags.length} tags`;

/** Authentication never replaces the local library. Transfers are explicit. */
export default function CloudLibrary({ library, onLoad, disabled = false }) {
  const [configuration] = useState(cloudConfiguration);
  const [client] = useState(getCloudClient);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!client);
  const [mode, setMode] = useState("signin");
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [cloud, setCloud] = useState(null);
  const [checked, setChecked] = useState(false);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [pending, setPending] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [recovery, setRecovery] = useState(() => getRecoveryLibrary());
  const userRef = useRef(null);
  const epochRef = useRef(0);
  const mounted = useRef(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const userId = session?.user?.id;

  useEffect(() => {
    mounted.current = true;
    if (!client) return () => { mounted.current = false; };
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted.current) return;
      const nextId = nextSession?.user?.id ?? null;
      if (userRef.current !== nextId) {
        userRef.current = nextId;
        epochRef.current += 1;
        setCloud(null);
        setChecked(false);
        setPending(null);
        setConfirmUpload(false);
        setBusy(null);
        setError("");
        setNotice("");
      }
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => { mounted.current = false; epochRef.current += 1; subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previous = document.activeElement;
    panel?.querySelector("button, input")?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    panel?.addEventListener("keydown", handleKey);
    return () => { panel?.removeEventListener("keydown", handleKey); (previous?.isConnected ? previous : triggerRef.current)?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open || !userId || !client) return;
    const token = { userId, epoch: epochRef.current };
    let active = true;
    setError("");
    setBusy("Checking cloud status");
    inspectCloudLibrary(client, userId).then((metadata) => {
      if (!active || !isCurrent(token)) return;
      setCloud(metadata);
      setChecked(true);
    }).catch((failure) => {
      if (active && isCurrent(token)) setError(failure.message);
    }).finally(() => { if (active && isCurrent(token)) setBusy(null); });
    return () => { active = false; };
  }, [open, userId, client, statusAttempt]);

  function isCurrent(token) {
    return mounted.current && token.userId === userRef.current && token.epoch === epochRef.current;
  }

  async function authenticate(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const username = String(form.get("username") || "").trim();
    setBusy(mode === "signup" ? "Creating account" : "Signing in");
    setError(""); setNotice("");
    try {
      const { data, error: authError } = mode === "signup"
        ? await client.auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: `${window.location.origin}/` } })
        : await client.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (mounted.current) setNotice(mode === "signup" && !data.session ? "Check your email to confirm your account, then sign in. Your local library is still here." : "Signed in. Choose Upload or Download to transfer your library.");
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) setBusy(null); }
  }

  async function transfer(direction) {
    if (!userId || busy || disabled) return;
    const token = { userId, epoch: epochRef.current };
    setError(""); setNotice(""); setConfirmUpload(false);
    setBusy(direction === "upload" ? "Uploading library" : "Downloading library");
    try {
      if (direction === "upload") {
        const metadata = await uploadCloudLibrary(client, userId, library, cloud?.revision ?? 0);
        if (isCurrent(token)) { setCloud(metadata); setChecked(true); setNotice("Uploaded. Download this library on your other device to use it there."); }
      } else {
        const downloaded = await downloadCloudLibrary(client, userId);
        if (isCurrent(token)) setPending({ ...downloaded, userId, epoch: token.epoch });
      }
    } catch (failure) { if (isCurrent(token)) setError(failure.message); }
    finally { if (isCurrent(token)) setBusy(null); }
  }

  function applyDownload() {
    if (!pending || disabled || !isCurrent(pending)) return;
    try {
      const previous = preserveLocalLibrary(library);
      onLoad(snapshotLibrary(pending.library));
      setRecovery(previous);
      setCloud({ revision: pending.revision, updated_at: pending.updated_at });
      setChecked(true);
      setPending(null);
      setNotice("Cloud library loaded. A recovery copy of your previous local library is available below.");
      setError("");
    } catch (failure) { setError(failure.message); }
  }

  async function signOut() {
    setBusy("Signing out"); setError("");
    try {
      const { error: signOutError } = await client.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      setNotice("Signed out. The library on this browser remains available.");
    } catch (failure) { setError(failure.message); }
    finally { if (mounted.current) setBusy(null); }
  }

  function restoreRecovery() {
    if (disabled || !recovery) return;
    try {
      const previous = preserveLocalLibrary(library);
      onLoad(recovery);
      setRecovery(previous);
      setNotice("Previous local library restored. Upload it only if you want it to replace the cloud version.");
      setError("");
    } catch (failure) { setError(failure.message); }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled) return;
    setError("");
    try { setPendingImport(snapshotLibrary(JSON.parse(await file.text()), { maxBytes: Infinity })); }
    catch (failure) { setError(failure instanceof SyntaxError ? "Choose a valid CodeRecall JSON backup." : failure.message); }
  }

  function applyImport() {
    if (!pendingImport || disabled) return;
    try {
      const previous = preserveLocalLibrary(library);
      onLoad(pendingImport);
      setRecovery(previous);
      setPendingImport(null);
      setNotice("Backup imported on this browser. Upload it to make it available on another device.");
      setError("");
    } catch (failure) { setError(failure.message); }
  }

  return <>
    <button ref={triggerRef} data-cloud-library type="button" className="cloud-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Account and backup" title="Account, cloud library, and local backup">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7 18H6a4 4 0 0 1-.6-7.96 7 7 0 0 1 13.56 1.3A3.5 3.5 0 0 1 18 18h-1M12 12v9m-3-6 3-3 3 3" /></svg>
      <span>{userId ? "Cloud library" : "Account & backup"}</span>
    </button>
    {open && <div data-cloud-library className="cloud-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={panelRef} className="cloud-panel" role="dialog" aria-modal="true" aria-labelledby="cloud-title">
        <div className="cloud-heading"><h2 id="cloud-title">Account & backup</h2><button type="button" className="cloud-close" aria-label="Close account and backup" onClick={() => setOpen(false)}>×</button></div>
        <p className="cloud-intro">Your edits save on this browser. Upload and download when you want to move your library between devices.</p>
        {error && <p role="alert" className="cloud-error">{error}</p>}
        {notice && <p role="status" className="cloud-notice">{notice}</p>}
        {!configuration.configured ? <p className="cloud-muted">{configuration.message}</p> : !authReady ? <p role="status">Checking your session…</p> : userId ? <>
          <div className="cloud-account"><div><strong>{session.user.email}</strong><span>Private cloud snapshot{cloud ? ` · revision ${cloud.revision}` : ""}</span></div><button type="button" disabled={Boolean(busy)} onClick={signOut}>Sign out</button></div>
          <p className="cloud-muted">Last cloud upload: {dateLabel(cloud?.updated_at)}. Signing in does not replace the library on this device.</p>
          {!checked && !busy && <button type="button" onClick={() => setStatusAttempt(attempt => attempt + 1)}>Retry cloud status</button>}
          {disabled && <p className="cloud-muted">Save or close the editor before transferring or restoring a library.</p>}
          <div className="cloud-actions"><button type="button" className="cloud-primary" disabled={Boolean(busy) || disabled || !checked || Boolean(pending)} onClick={() => cloud ? setConfirmUpload(true) : transfer("upload")}>Upload this library</button><button type="button" disabled={Boolean(busy) || disabled || !checked || !cloud || Boolean(pending)} onClick={() => transfer("download")}>Download cloud library</button></div>
          {confirmUpload && <div className="cloud-confirm"><strong>Replace the cloud snapshot?</strong><p>Your current {counts(library)} will replace revision {cloud.revision}. Downloads on other devices will receive this version.</p><div className="cloud-actions"><button type="button" className="cloud-primary" disabled={Boolean(busy) || disabled} onClick={() => transfer("upload")}>Replace cloud library</button><button type="button" onClick={() => setConfirmUpload(false)}>Cancel</button></div></div>}
          {pending && <div className="cloud-confirm"><strong>Load cloud revision {pending.revision}?</strong><p>{counts(pending.library)} · uploaded {dateLabel(pending.updated_at)}. This replaces the library on this browser. A local recovery copy is saved first.</p><div className="cloud-actions"><button type="button" className="cloud-primary" disabled={disabled || Boolean(busy)} onClick={applyDownload}>Replace local library</button><button type="button" onClick={() => setPending(null)}>Cancel</button></div></div>}
        </> : <form className="cloud-form" onSubmit={authenticate}>
          <div className="cloud-tabs"><button type="button" aria-pressed={mode === "signin"} disabled={Boolean(busy)} onClick={() => { setMode("signin"); setError(""); }}>Sign in</button><button type="button" aria-pressed={mode === "signup"} disabled={Boolean(busy)} onClick={() => { setMode("signup"); setError(""); }}>Create account</button></div>
          {mode === "signup" && <label>Username <span>(optional)</span><input name="username" autoComplete="nickname" maxLength={60} disabled={Boolean(busy)} /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" required disabled={Boolean(busy)} /></label>
          <label>Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 10 : undefined} required disabled={Boolean(busy)} /></label>
          {mode === "signup" && <small>Use at least 10 characters. Check your email if confirmation is enabled.</small>}
          <button type="submit" className="cloud-primary" disabled={Boolean(busy)}>{mode === "signup" ? "Create account" : "Sign in"}</button>
        </form>}
        {busy && <p role="status" className="cloud-working">{busy}…</p>}
        <div className="cloud-local"><strong>Local backup</strong><p className="cloud-muted">{counts(library)}. A downloaded JSON backup includes your code and metadata; keep it somewhere private.</p><div className="cloud-actions"><button type="button" disabled={Boolean(busy)} onClick={() => exportBackup(library)}>Export JSON backup</button><label className={`cloud-import${disabled || busy ? " is-disabled" : ""}`}>Import JSON backup<input type="file" accept=".json,application/json" disabled={disabled || Boolean(busy)} onChange={importBackup} /></label>{recovery && <button type="button" disabled={disabled || Boolean(busy)} onClick={restoreRecovery}>Restore previous local library</button>}</div>{pendingImport && <div className="cloud-confirm"><strong>Replace this library with the backup?</strong><p>{counts(pendingImport)}. Your current local library is saved as a recovery copy first.</p><div className="cloud-actions"><button type="button" className="cloud-primary" disabled={disabled || Boolean(busy)} onClick={applyImport}>Import and replace</button><button type="button" onClick={() => setPendingImport(null)}>Cancel</button></div></div>}<p className="cloud-muted cloud-small">Signing out keeps the downloaded library on this browser. Use your own browser profile on shared devices.</p></div>
      </section>
    </div>}
  </>;
}
