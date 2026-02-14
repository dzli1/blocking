import { useState, useEffect, useCallback } from "react";

const API_BASE = "http://127.0.0.1:9099";

// ─── Mock data for demo mode (when API is unreachable) ───
const DEMO_STATE = {
  enabled: true,
  blocked_sites: [
    "facebook.com", "www.facebook.com",
    "twitter.com", "www.twitter.com",
    "x.com", "www.x.com",
    "instagram.com", "www.instagram.com",
    "reddit.com", "www.reddit.com",
    "tiktok.com", "www.tiktok.com",
    "youtube.com", "www.youtube.com",
  ],
  exceptions: [],
  effective_blocklist: [],
};

function groupSites(sites) {
  const groups = {};
  for (const site of sites) {
    const base = site.replace(/^www\./, "");
    if (!groups[base]) groups[base] = [];
    groups[base].push(site);
  }
  return Object.keys(groups).sort();
}

function timeRemaining(isoStr) {
  const diff = new Date(isoStr) - new Date();
  if (diff <= 0) return "expired";
  const mins = Math.ceil(diff / 60000);
  return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

export default function SiteBlocker() {
  const [state, setState] = useState(null);
  const [demo, setDemo] = useState(false);
  const [newSite, setNewSite] = useState("");
  const [excSite, setExcSite] = useState("");
  const [excMins, setExcMins] = useState(15);
  const [tab, setTab] = useState("blocked");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      setState(data);
      setDemo(false);
    } catch {
      setState(DEMO_STATE);
      setDemo(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 5000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const apiPost = async (endpoint, body) => {
    if (demo) {
      showToast("Demo mode — start the Python script to connect", "warn");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setState(data);
      return data;
    } catch {
      showToast("Connection lost", "error");
    }
  };

  const addSite = async () => {
    const site = newSite.trim().toLowerCase();
    if (!site) return;
    await apiPost("/api/add_site", { site });
    setNewSite("");
    showToast(`Blocked ${site}`);
  };

  const removeSite = async (site) => {
    await apiPost("/api/remove_site", { site });
    showToast(`Unblocked ${site}`);
  };

  const addException = async () => {
    const site = excSite.trim().toLowerCase();
    if (!site) return;
    await apiPost("/api/add_exception", { site, minutes: excMins });
    setExcSite("");
    showToast(`Exception: ${site} for ${excMins}m`);
  };

  const removeException = async (site) => {
    await apiPost("/api/remove_exception", { site });
    showToast(`Removed exception for ${site}`);
  };

  const toggle = async () => {
    await apiPost("/api/toggle", {});
    showToast(state?.enabled ? "Blocker paused" : "Blocker resumed");
  };

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Connecting...</p>
      </div>
    );
  }

  const grouped = groupSites(state?.blocked_sites || []);
  const exceptions = state?.exceptions || [];
  const enabled = state?.enabled ?? true;

  return (
    <div style={styles.root}>
      {/* Background grid */}
      <div style={styles.gridBg} />

      {/* Toast */}
      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.type === "error" ? "#ff3b30" : toast.type === "warn" ? "#ff9500" : "#30d158",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoWrap}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="9" y1="9" x2="15" y2="15" />
              <line x1="15" y1="9" x2="9" y2="15" />
            </svg>
          </div>
          <div>
            <h1 style={styles.title}>LOCKDOWN</h1>
            <p style={styles.subtitle}>site blocker</p>
          </div>
        </div>
        <button onClick={toggle} style={{
          ...styles.toggleBtn,
          background: enabled ? "rgba(255,69,58,0.15)" : "rgba(48,209,88,0.15)",
          color: enabled ? "#ff453a" : "#30d158",
          borderColor: enabled ? "rgba(255,69,58,0.3)" : "rgba(48,209,88,0.3)",
        }}>
          <span style={{
            ...styles.dot,
            background: enabled ? "#ff453a" : "#30d158",
            boxShadow: enabled ? "0 0 8px #ff453a" : "0 0 8px #30d158",
          }} />
          {enabled ? "ACTIVE" : "PAUSED"}
        </button>
      </header>

      {demo && (
        <div style={styles.demoBanner}>
          <span style={{ fontSize: 14 }}>⚡</span>
          <span>Demo mode — run <code style={styles.code}>sudo python3 site_blocker.py</code> to connect</span>
        </div>
      )}

      {/* Stats */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statNum}>{grouped.length}</span>
          <span style={styles.statLabel}>Sites Blocked</span>
        </div>
        <div style={styles.statCard}>
          <span style={{ ...styles.statNum, color: "#ff9f0a" }}>{exceptions.length}</span>
          <span style={styles.statLabel}>Exceptions</span>
        </div>
        <div style={styles.statCard}>
          <span style={{ ...styles.statNum, color: enabled ? "#30d158" : "#636366" }}>{enabled ? "ON" : "OFF"}</span>
          <span style={styles.statLabel}>Shield</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabRow}>
        {["blocked", "exceptions"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...styles.tab,
              ...(tab === t ? styles.tabActive : {}),
            }}
          >
            {t === "blocked" ? "Blocked Sites" : "Exceptions"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {tab === "blocked" && (
          <>
            {/* Add site input */}
            <div style={styles.inputRow}>
              <input
                value={newSite}
                onChange={(e) => setNewSite(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSite()}
                placeholder="e.g. netflix.com"
                style={styles.input}
              />
              <button onClick={addSite} style={styles.addBtn}>+ Block</button>
            </div>

            {/* Site list */}
            <div style={styles.list}>
              {grouped.length === 0 && (
                <p style={styles.emptyText}>No sites blocked yet. Add one above.</p>
              )}
              {grouped.map((site) => {
                const isExcepted = exceptions.some(
                  (e) => e.site === site || e.site === `www.${site}`
                );
                return (
                  <div key={site} style={styles.siteRow}>
                    <div style={styles.siteInfo}>
                      <div style={{
                        ...styles.siteIndicator,
                        background: isExcepted ? "#ff9f0a" : enabled ? "#ff453a" : "#636366",
                        boxShadow: isExcepted
                          ? "0 0 6px rgba(255,159,10,0.5)"
                          : enabled ? "0 0 6px rgba(255,69,58,0.5)" : "none",
                      }} />
                      <span style={styles.siteName}>{site}</span>
                      {isExcepted && <span style={styles.excBadge}>exception</span>}
                    </div>
                    <button onClick={() => removeSite(site)} style={styles.removeBtn}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "exceptions" && (
          <>
            {/* Add exception */}
            <div style={styles.inputRow}>
              <input
                value={excSite}
                onChange={(e) => setExcSite(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addException()}
                placeholder="site to temporarily allow"
                style={{ ...styles.input, flex: 2 }}
              />
              <div style={styles.minsWrap}>
                <input
                  type="number"
                  value={excMins}
                  onChange={(e) => setExcMins(Math.max(1, parseInt(e.target.value) || 1))}
                  style={styles.minsInput}
                  min={1}
                />
                <span style={styles.minsLabel}>min</span>
              </div>
              <button onClick={addException} style={{...styles.addBtn, background: "rgba(255,159,10,0.15)", color: "#ff9f0a", borderColor: "rgba(255,159,10,0.3)"}}>
                + Allow
              </button>
            </div>

            <div style={styles.list}>
              {exceptions.length === 0 && (
                <p style={styles.emptyText}>No active exceptions. Sites in your blocklist will all be blocked.</p>
              )}
              {exceptions.map((exc) => (
                <div key={exc.site} style={styles.siteRow}>
                  <div style={styles.siteInfo}>
                    <div style={{
                      ...styles.siteIndicator,
                      background: "#ff9f0a",
                      boxShadow: "0 0 6px rgba(255,159,10,0.5)",
                    }} />
                    <span style={styles.siteName}>{exc.site}</span>
                    <span style={styles.timeBadge}>{timeRemaining(exc.until)}</span>
                  </div>
                  <button onClick={() => removeException(exc.site)} style={styles.removeBtn}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer style={styles.footer}>
        <span>API: {demo ? "disconnected" : `127.0.0.1:9099`}</span>
        <span style={{ opacity: 0.4 }}>•</span>
        <span>Config: ~/.site_blocker/config.json</span>
      </footer>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0a0a0c",
    color: "#e5e5ea",
    fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
    position: "relative",
    overflow: "hidden",
    padding: "24px",
    maxWidth: 640,
    margin: "0 auto",
  },
  gridBg: {
    position: "fixed",
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(255,69,58,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,69,58,0.03) 1px, transparent 1px)
    `,
    backgroundSize: "40px 40px",
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    position: "relative",
    zIndex: 1,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "rgba(255,69,58,0.1)",
    border: "1px solid rgba(255,69,58,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "0.15em",
    color: "#fff",
    margin: 0,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 11,
    color: "#636366",
    margin: 0,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  toggleBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 18px",
    borderRadius: 8,
    border: "1px solid",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.1em",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
  },
  demoBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: "rgba(255,159,10,0.08)",
    border: "1px solid rgba(255,159,10,0.2)",
    borderRadius: 8,
    fontSize: 12,
    color: "#ff9f0a",
    marginBottom: 20,
    position: "relative",
    zIndex: 1,
  },
  code: {
    background: "rgba(255,255,255,0.08)",
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 11,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
    marginBottom: 24,
    position: "relative",
    zIndex: 1,
  },
  statCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
    padding: "16px 12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    fontSize: 28,
    fontWeight: 700,
    color: "#ff453a",
    lineHeight: 1,
  },
  statLabel: {
    fontSize: 10,
    color: "#636366",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  tabRow: {
    display: "flex",
    gap: 2,
    marginBottom: 16,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: 3,
    position: "relative",
    zIndex: 1,
  },
  tab: {
    flex: 1,
    padding: "10px 0",
    border: "none",
    background: "transparent",
    color: "#636366",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.05em",
    cursor: "pointer",
    borderRadius: 6,
    transition: "all 0.2s",
  },
  tabActive: {
    background: "rgba(255,69,58,0.12)",
    color: "#ff453a",
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    color: "#e5e5ea",
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
    transition: "border-color 0.2s",
  },
  addBtn: {
    padding: "10px 18px",
    background: "rgba(255,69,58,0.12)",
    border: "1px solid rgba(255,69,58,0.25)",
    borderRadius: 8,
    color: "#ff453a",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.2s",
  },
  minsWrap: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "0 10px",
  },
  minsInput: {
    width: 40,
    padding: "10px 0",
    background: "transparent",
    border: "none",
    color: "#e5e5ea",
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
    textAlign: "center",
  },
  minsLabel: {
    fontSize: 11,
    color: "#636366",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  siteRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    transition: "background 0.15s",
  },
  siteInfo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  siteIndicator: {
    width: 7,
    height: 7,
    borderRadius: "50%",
  },
  siteName: {
    fontSize: 13,
    color: "#e5e5ea",
  },
  excBadge: {
    fontSize: 10,
    color: "#ff9f0a",
    background: "rgba(255,159,10,0.12)",
    padding: "2px 8px",
    borderRadius: 4,
    letterSpacing: "0.04em",
  },
  timeBadge: {
    fontSize: 10,
    color: "#30d158",
    background: "rgba(48,209,88,0.12)",
    padding: "2px 8px",
    borderRadius: 4,
    fontVariantNumeric: "tabular-nums",
  },
  removeBtn: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 6,
    color: "#636366",
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  emptyText: {
    textAlign: "center",
    color: "#48484a",
    fontSize: 13,
    padding: "32px 0",
  },
  footer: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
    marginTop: 32,
    fontSize: 10,
    color: "#48484a",
    letterSpacing: "0.04em",
    position: "relative",
    zIndex: 1,
  },
  toast: {
    position: "fixed",
    top: 20,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 20px",
    borderRadius: 8,
    color: "#fff",
    fontSize: 12,
    fontFamily: "'SF Mono', monospace",
    fontWeight: 600,
    zIndex: 100,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    letterSpacing: "0.04em",
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "#0a0a0c",
    gap: 16,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid rgba(255,69,58,0.2)",
    borderTopColor: "#ff453a",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    color: "#636366",
    fontSize: 12,
    fontFamily: "'SF Mono', monospace",
    letterSpacing: "0.08em",
  },
};
