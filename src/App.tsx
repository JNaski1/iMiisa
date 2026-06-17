import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

type EventType = "poop" | "pee" | "feeding";

type Event = {
  id: string;
  type: EventType;
  timestamp: string;
  date: string;
};

function formatDate(date: Date) {
  return date.toLocaleDateString("fi-FI");
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function App() {
  const AUTH_KEY = "imiisa_authenticated";
  const readAuth = () => {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "true";
    } catch (e) {
      return false;
    }
  };

  const writeAuth = (v: boolean) => {
    try {
      if (v) sessionStorage.setItem(AUTH_KEY, "true");
      else sessionStorage.removeItem(AUTH_KEY);
    } catch (e) {
      // ignore
    }
  };

  const [authenticated, setAuthenticated] = useState<boolean>(() => readAuth());
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEvents, setShowEvents] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  // Hard-coded birth date (13.6.26) — keep this value persistent
  const [birthIso] = useState<string>(() => "2026-06-13");
  const [todaysEvents, setTodaysEvents] = useState<Event[]>([]);
  const [latestFeeding, setLatestFeeding] = useState<Event | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [activeView, setActiveView] = useState<"dashboard" | "stats">("dashboard");
  const [stats, setStats] = useState<{
    feedings: number;
    pees: number;
    poops: number;
    total: number;
    avgFeedings: number;
    avgPees: number;
    avgPoops: number;
    trends: { feedings: number; pees: number; poops: number };
    days: string[];
    dailyFeedings: number[];
    dailyPees: number[];
    dailyPoops: number[];
  } | null>(null);

  const currentDateKey = getDateKey(currentDate);

  // run loaders when current date key changes, but only after authentication
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!authenticated) return;
    loadEvents();
    loadTodaysEvents();
    loadStats();
    loadLatestFeeding();
  }, [currentDateKey, authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [authenticated]);

  function logout() {
    writeAuth(false);
    setAuthenticated(false);
    setPinInput("");
    setPinError(null);
  }

  function handleUnlock() {
    // single shared PIN
    const PIN = "1306";
    if (pinInput.trim() === PIN) {
      writeAuth(true);
      setAuthenticated(true);
      setPinInput("");
      setPinError(null);
    } else {
      setPinError("Väärä PIN");
    }
  }

  // birthIso is initialized from localStorage lazily above

  


  

  function computeAgeDays(birthIsoOrNull: string | null) {
    let bd: Date | null = null;
    if (birthIsoOrNull) bd = new Date(birthIsoOrNull);
    else if (events.length > 0) bd = new Date(events[0].timestamp);
    if (!bd) return "";

    const now = currentDate;
    const diffDays = Math.floor((now.getTime() - bd.getTime()) / (1000 * 60 * 60 * 24));
    return `${diffDays} päivää`;
  }

  async function loadEvents() {
    setLoading(true);

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("event_date", currentDateKey)
      .order("event_time", { ascending: true });

    if (error) {
      console.error("Virhe ladattaessa tapahtumia:", error);
      setLoading(false);
      return;
    }

    const mapped: Event[] =
      data?.map((row) => ({
        id: row.id,
        type: row.event_type as EventType,
        timestamp: row.event_time,
        date: row.event_date,
      })) ?? [];

    setEvents(mapped);
    setLoading(false);
  }

  async function loadTodaysEvents() {
    const todayKey = getDateKey(new Date());

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("event_date", todayKey)
      .order("event_time", { ascending: true });

    if (error) {
      console.error("Virhe ladattaessa tämän päivän tapahtumia:", error);
      return;
    }

    const mapped: Event[] =
      data?.map((row) => ({
        id: row.id,
        type: row.event_type as EventType,
        timestamp: row.event_time,
        date: row.event_date,
      })) ?? [];

    setTodaysEvents(mapped);
  }

  async function loadLatestFeeding() {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("event_type", "feeding")
      .order("event_time", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Virhe ladattaessa viimeisintä imetystä:", error);
      return;
    }

    if (data && data.length > 0) {
      const row = data[0];
      setLatestFeeding({ id: row.id, type: row.event_type as EventType, timestamp: row.event_time, date: row.event_date });
    } else {
      setLatestFeeding(null);
    }
  }

  async function loadStats() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6); // last 7 days

    const startKey = getDateKey(start);
    const endKey = getDateKey(end);

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .gte("event_date", startKey)
      .lte("event_date", endKey)
      .order("event_time", { ascending: true });

    if (error) {
      console.error("Virhe ladattaessa tilastoja:", error);
      return;
    }

    const mapped: Event[] =
      data?.map((row) => ({
        id: row.id,
        type: row.event_type as EventType,
        timestamp: row.event_time,
        date: row.event_date,
      })) ?? [];

    // initialize per-day counts
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(getDateKey(d));
    }

    const totals = { feedings: 0, pees: 0, poops: 0 };
    const countsByDate: Record<string, { feedings: number; pees: number; poops: number }> = {};
    days.forEach((d) => (countsByDate[d] = { feedings: 0, pees: 0, poops: 0 }));

    mapped.forEach((e) => {
      if (!countsByDate[e.date]) countsByDate[e.date] = { feedings: 0, pees: 0, poops: 0 };
      if (e.type === "feeding") countsByDate[e.date].feedings++;
      if (e.type === "pee") countsByDate[e.date].pees++;
      if (e.type === "poop") countsByDate[e.date].poops++;
      if (e.type === "feeding") totals.feedings++;
      if (e.type === "pee") totals.pees++;
      if (e.type === "poop") totals.poops++;
    });

    const dailyFeedings = days.map((d) => countsByDate[d]?.feedings ?? 0);
    const dailyPees = days.map((d) => countsByDate[d]?.pees ?? 0);
    const dailyPoops = days.map((d) => countsByDate[d]?.poops ?? 0);

    const avgFeedings = Math.round((totals.feedings / 7) * 10) / 10;
    const avgPees = Math.round((totals.pees / 7) * 10) / 10;
    const avgPoops = Math.round((totals.poops / 7) * 10) / 10;

    const lastDay = days[days.length - 1];
    const prevDay = days[days.length - 2];

    const trends = {
      feedings: countsByDate[lastDay].feedings - countsByDate[prevDay].feedings,
      pees: countsByDate[lastDay].pees - countsByDate[prevDay].pees,
      poops: countsByDate[lastDay].poops - countsByDate[prevDay].poops,
    };

    setStats({
      feedings: totals.feedings,
      pees: totals.pees,
      poops: totals.poops,
      total: totals.feedings + totals.pees + totals.poops,
      avgFeedings,
      avgPees,
      avgPoops,
      trends,
      days,
      dailyFeedings,
      dailyPees,
      dailyPoops,
    });
  }

  async function addEvent(type: EventType) {
    const now = new Date().toISOString();

    const { error } = await supabase.from("events").insert({
      event_type: type,
      event_time: now,
      event_date: currentDateKey,
    });

    if (error) {
      console.error("Virhe lisättäessä:", error);
      return;
    }

    await loadEvents();
    await loadTodaysEvents();
    await loadLatestFeeding();
  }

  async function removeLatestEvent(type: EventType) {
    const latest = [...events]
      .filter((e) => e.type === type)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime()
      )[0];

    if (!latest) return;

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", latest.id);

    if (error) {
      console.error("Virhe poistettaessa:", error);
      return;
    }

    await loadEvents();
    await loadTodaysEvents();
    await loadLatestFeeding();
  }

  const poopCount = events.filter(
    (e) => e.type === "poop"
  ).length;

  const peeCount = events.filter(
    (e) => e.type === "pee"
  ).length;

  const feedingCount = events.filter(
    (e) => e.type === "feeding"
  ).length;

  const safetyOk =
    poopCount >= 1 &&
    peeCount >= 5 &&
    feedingCount >= 10;

  const sortedEvents = useMemo(() => {
    return [...events].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() -
        new Date(b.timestamp).getTime()
    );
  }, [events]);

  const todaysCounts = useMemo(() => {
    const feedings = todaysEvents.filter((e) => e.type === "feeding").length;
    const pees = todaysEvents.filter((e) => e.type === "pee").length;
    const poops = todaysEvents.filter((e) => e.type === "poop").length;
    const total = todaysEvents.length;
    return { feedings, pees, poops, total };
  }, [todaysEvents]);

  const iconForType = (type: EventType) => {
    switch (type) {
      case "poop":
        return "💩";
      case "pee":
        return "💧";
      case "feeding":
        return "🍼";
    }
  };

  function getLatestEvent(type: EventType) {
    return [...events]
      .filter((e) => e.type === type)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }

  function getTimeAgo(timestamp: string) {
    const diffMs = new Date().getTime() - new Date(timestamp).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${minutes} min sitten`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} h ${remainingMinutes} min sitten`;
  }

  function formatDurationMs(ms: number) {
    if (ms < 60000) return "0 min";
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${hours} h ${rem} min`;
  }

  function formatRemainingMs(ms: number) {
    const minutes = Math.ceil(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    const hLabel = hours === 1 ? "tunti" : "tuntia";
    const mLabel = rem === 1 ? "minuutti" : "minuuttia";
    if (hours > 0) return `${hours} ${hLabel} ${rem} ${mLabel}`;
    return `${rem} ${mLabel}`;
  }

  function computeAvgIntervalToday(): string | null {
    const feedings = todaysEvents.filter((e) => e.type === "feeding").map((e) => new Date(e.timestamp).getTime()).sort((a, b) => a - b);
    if (feedings.length < 2) return null;
    const diffs: number[] = [];
    for (let i = 1; i < feedings.length; i++) diffs.push(feedings[i] - feedings[i - 1]);
    const avg = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    return formatDurationMs(Math.round(avg));
  }

  const renderCard = (
    emoji: string,
    title: string,
    count: number,
    target: number,
    color: string,
    type: EventType
  ) => {
    const latest = getLatestEvent(type);
    const lastFeeding = type === "feeding" ? (latestFeeding ?? latest) : latest;
    const elapsedMs = lastFeeding ? Math.max(0, now.getTime() - new Date(lastFeeding.timestamp).getTime()) : null;

    return (
      <div className="card" style={{ background: color }}>
        <div className="card-header">
          <span className="card-emoji">{emoji}</span>
          <span className="card-title">{title}</span>
        </div>

        <div className="card-count">
          {count}
          <span style={{ fontSize: 28, color: "#666" }}> / {target}</span>
        </div>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${Math.min(100, (count / target) * 100)}%` }} />
        </div>

        <div className="card-meta">
          {latest ? (
            <div>Viimeisin: {formatTime(latest.timestamp)} • {getTimeAgo(latest.timestamp)}</div>
          ) : (
            <div style={{ color: "#888" }}>Ei viimeisintä tapahtumaa</div>
          )}
        </div>

            {type === "feeding" && lastFeeding && (
              <div className="feeding-info">
                {elapsedMs !== null && (() => {
                  const threeH = 3 * 60 * 60 * 1000;
                  const remainingMs = Math.max(0, threeH - elapsedMs);
                  const percent = Math.min(100, Math.round((elapsedMs / threeH) * 100));
                  const stateClass = remainingMs === 0 ? "overdue" : remainingMs < 60 * 60 * 1000 ? "soon" : "ok";
                  const icon = stateClass === "overdue" ? "🚨" : stateClass === "soon" ? "🔔" : "🕒";

                  return (
                    <div className={`remaining-pill ${stateClass} top`}> 
                      <div className="remaining-header">
                        <span className="remaining-icon">{icon}</span>
                        <div className="remaining-text">
                          {remainingMs === 0 ? "Aika imetykseen: HETI" : `Aikaa seuraavaan: ${formatRemainingMs(remainingMs)}`}
                        </div>
                      </div>
                      <div className="remaining-progress" aria-hidden>
                        <div className="remaining-fill" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })()}

                <div className="feeding-header">🍼 Viimeisin imetys</div>
                <div className="elapsed-time">{formatDurationMs(elapsedMs ?? 0)} sitten</div>
                <div className="last-time">Viimeksi klo {formatTime(lastFeeding.timestamp)}</div>
                {computeAvgIntervalToday() && (
                  <div className="avg-interval">Keskiväli tänään: {computeAvgIntervalToday()}</div>
                )}
              </div>
            )}

        <div className="card-actions">
          <button onClick={() => removeLatestEvent(type)} className="circle-btn remove">−</button>
          <button onClick={() => addEvent(type)} className="circle-btn add">+</button>
        </div>
      </div>
    );
  };

  // If not authenticated, show lock screen only
  if (!authenticated) {
    return (
      <div className="app-root">
        <div className="container">
          <div className="lock-screen">
            <div className="lock-card">
              <img src="/avatar.jpg" alt="Miisa" className="brand-avatar lock-avatar" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/avatar.svg'; }} />
              <div className="page-title">iMiisa</div>
              <div className="lock-prompt">Anna PIN</div>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                className="pin-input"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
                aria-label="PIN"
                autoFocus
              />
              <button className="unlock-btn" onClick={handleUnlock}>Avaa</button>
              {pinError && <div className="pin-error">{pinError}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="container">
        
        <div className="app-header">
          <button
            onClick={() =>
              setCurrentDate(new Date(currentDate.getTime() - 86400000))
            }
            className="nav-button"
          >
            ←
          </button>

          <div style={{ textAlign: "center" }}>
            <div className="brand">
              <img src="/avatar.jpg" alt="Miisa" className="brand-avatar" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/avatar.svg'; }} />
              <div className="page-title">iMiisa</div>
            </div>
            <div className="date-text">{formatDate(currentDate)}</div>

            <div className="age-container">
              <div className="age-text">Ikäni: {computeAgeDays(birthIso) || "—"}</div>
            </div>
          </div>

          <button
            onClick={() => setCurrentDate(new Date(currentDate.getTime() + 86400000))}
            className="nav-button"
          >
            →
          </button>
        </div>

        <div className="safety-banner" style={{ background: safetyOk ? "#22c55e" : "#ef4444" }}>
          <h2>{safetyOk ? "😊 Toimenpidemäärät täyttyvät" : "⚠️ Toimenpidemäärät eivät täyty"}</h2>
        </div>

        <div className="view-tabs">
          <button className={`tab-button ${activeView === "dashboard" ? "active" : ""}`} onClick={() => setActiveView("dashboard")}>Yleiskuva</button>
          <button className={`tab-button ${activeView === "stats" ? "active" : ""}`} onClick={() => setActiveView("stats")}>Tilastot</button>
        </div>

        {activeView === "dashboard" ? (
          <>
            <div className="card" style={{ background: "#f8fafc" }}>
              <div className="card-header">
                <span className="card-title">Päivän yhteenveto</span>
              </div>

              <div className="summary-grid">
                <div className="summary-item">
                  <div className="summary-icon">🍼</div>
                  <div className="summary-count">{todaysCounts.feedings}</div>
                  <div className="summary-label">Imetykset</div>
                </div>

                <div className="summary-item">
                  <div className="summary-icon">💧</div>
                  <div className="summary-count">{todaysCounts.pees}</div>
                  <div className="summary-label">Pissat</div>
                </div>

                <div className="summary-item">
                  <div className="summary-icon">💩</div>
                  <div className="summary-count">{todaysCounts.poops}</div>
                  <div className="summary-label">Kakat</div>
                </div>
              </div>

              <div className="summary-footer">
                <div className="total-pill small">📊 Yhteensä: <strong>{todaysCounts.total}</strong></div>
              </div>
            </div>

            {renderCard(
              "🍼",
              "Imetykset",
              feedingCount,
              10,
              "#efe7ff",
              "feeding"
            )}

            {renderCard(
              "💧",
              "Pissat",
              peeCount,
              5,
              "#e6f3ff",
              "pee"
            )}

            {renderCard(
              "💩",
              "Kakat",
              poopCount,
              1,
              "#fff3df",
              "poop"
            )}

            <div className="events-panel">
              <button onClick={() => setShowEvents(!showEvents)} className="toggle-events">📋 Päivän tapahtumat</button>

              {showEvents && (
                <div style={{ marginTop: "16px" }}>
                  {loading ? (
                    <p>Ladataan...</p>
                  ) : sortedEvents.length === 0 ? (
                    <p>Ei tapahtumia.</p>
                  ) : (
                    <div className="events-list">
                      {sortedEvents.map((event, idx) => {
                        const ordinal = sortedEvents.slice(0, idx + 1).filter((e) => e.type === event.type).length;
                        const typeLabel = event.type === "feeding" ? "imetys" : event.type === "poop" ? "kakka" : "pissa";

                        return (
                          <div key={event.id} className="event-item">
                            <span className="event-icon">{iconForType(event.type)}</span>
                            <span className="event-label">Päivän {ordinal}. {typeLabel}</span>
                            <span className="event-time">{formatTime(event.timestamp)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="logout-bottom">
              <button className="logout-bottom-btn" onClick={logout}>
                <span className="logout-icon">🔒</span>
                <span>Kirjaudu ulos</span>
              </button>
            </div>
          </>
        ) : (
          <div className="card" style={{ background: "#fff" }}>
            <div className="card-header">
              <span className="card-title">Tilastot (viimeiset 7 päivää)</span>
            </div>

            {!stats ? (
              <div style={{ padding: 20 }}>Ladataan...</div>
            ) : (
              <div style={{ padding: 12 }}>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-top">
                      <div className="stat-emoji">🍼</div>
                      <div className="stat-value">{stats.feedings}</div>
                    </div>
                    <div className="stat-label">Imetykset • {stats.avgFeedings}/pv</div>
                    <div className="sparkline" aria-hidden>
                      {(() => {
                        const arr = stats.dailyFeedings;
                        const max = Math.max(...arr, 1);
                        return arr.map((v, i) => (
                          <div key={i} className="spark-bar" style={{ height: `${(v / max) * 100}%`, background: `linear-gradient(180deg,#fde68a,#f59e0b)` }} />
                        ));
                      })()}
                    </div>
                    <div className={`trend ${stats.trends.feedings > 0 ? 'trend-up' : stats.trends.feedings < 0 ? 'trend-down' : ''}`}>{stats.trends.feedings > 0 ? `▲ +${stats.trends.feedings}` : stats.trends.feedings < 0 ? `▼ ${Math.abs(stats.trends.feedings)}` : `–`}</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-top">
                      <div className="stat-emoji">💧</div>
                      <div className="stat-value">{stats.pees}</div>
                    </div>
                    <div className="stat-label">Pissat • {stats.avgPees}/pv</div>
                    <div className="sparkline" aria-hidden>
                      {(() => {
                        const arr = stats.dailyPees;
                        const max = Math.max(...arr, 1);
                        return arr.map((v, i) => (
                          <div key={i} className="spark-bar" style={{ height: `${(v / max) * 100}%`, background: `linear-gradient(180deg,#bfdbfe,#3b82f6)` }} />
                        ));
                      })()}
                    </div>
                    <div className={`trend ${stats.trends.pees > 0 ? 'trend-up' : stats.trends.pees < 0 ? 'trend-down' : ''}`}>{stats.trends.pees > 0 ? `▲ +${stats.trends.pees}` : stats.trends.pees < 0 ? `▼ ${Math.abs(stats.trends.pees)}` : `–`}</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-top">
                      <div className="stat-emoji">💩</div>
                      <div className="stat-value">{stats.poops}</div>
                    </div>
                    <div className="stat-label">Kakat • {stats.avgPoops}/pv</div>
                    <div className="sparkline" aria-hidden>
                      {(() => {
                        const arr = stats.dailyPoops;
                        const max = Math.max(...arr, 1);
                        return arr.map((v, i) => (
                          <div key={i} className="spark-bar" style={{ height: `${(v / max) * 100}%`, background: `linear-gradient(180deg,#fde68a,#f97316)` }} />
                        ));
                      })()}
                    </div>
                    <div className={`trend ${stats.trends.poops > 0 ? 'trend-up' : stats.trends.poops < 0 ? 'trend-down' : ''}`}>{stats.trends.poops > 0 ? `▲ +${stats.trends.poops}` : stats.trends.poops < 0 ? `▼ ${Math.abs(stats.trends.poops)}` : `–`}</div>
                  </div>
                </div>

                <div style={{ marginTop: 12, textAlign: 'center', color: '#555' }}>
                  <div className="total-pill">
                    <span className="total-icon">📊</span>
                    <span>Yhteensä: <strong>{stats.total}</strong></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}