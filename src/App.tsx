import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import "./App.css";

type EventType = "poop" | "pee" | "feeding" | "photo";

type Event = {
  id: string;
  type: EventType;
  timestamp: string;
  date: string;
};

type Baby = {
  id: string;
  name: string;
  birth_date?: string | null;
};

type PhotoComment = {
  id: string;
  photo_id: string;
  body: string;
  created_at: string;
};

type PhotoReaction = {
  id: string;
  photo_id: string;
  emoji: string;
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

function isToday(date: Date) {
  return getDateKey(date) === getDateKey(new Date());
}

function formatPhotoDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatCommentTime(iso: string) {
  const d = new Date(iso);
  const isT = getDateKey(d) === getDateKey(new Date());
  const time = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  if (isT) return `klo ${time}`;
  return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) + ` · klo ${time}`;
}

export default function App() {
  const AUTH_KEY = "imiisa_authenticated";
  const BABY_KEY = "imiisa_current_baby";
  const BABY_ID_KEY = "imiisa_current_baby_id";

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

  const readCurrentBaby = (): Baby | null => {
    try {
      const raw = sessionStorage.getItem(BABY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Baby;
      if (!parsed?.id) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const readCurrentBabyId = (): string | null => {
    try {
      return sessionStorage.getItem(BABY_ID_KEY);
    } catch {
      return null;
    }
  };

  const writeCurrentBaby = (baby: Baby | null) => {
    try {
      if (baby) {
        sessionStorage.setItem(BABY_KEY, JSON.stringify(baby));
        sessionStorage.setItem(BABY_ID_KEY, baby.id);
      } else {
        sessionStorage.removeItem(BABY_KEY);
        sessionStorage.removeItem(BABY_ID_KEY);
      }
    } catch {
      // ignore
    }
  };

  const initialBaby = readCurrentBaby();
  const initialBabyId = readCurrentBabyId() ?? initialBaby?.id ?? null;

  const [authenticated, setAuthenticated] = useState<boolean>(() => readAuth() && !!initialBabyId);
  const [currentBaby, setCurrentBaby] = useState<Baby | null>(() => initialBaby);
  const [currentBabyId, setCurrentBabyId] = useState<string | null>(() => initialBabyId);
  const [babies, setBabies] = useState<Baby[]>([]);
  const [selectedBabyId, setSelectedBabyId] = useState<string>(() => initialBabyId ?? "");
  const [babiesLoading, setBabiesLoading] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const birthIso = currentBaby?.birth_date ?? null;
  const [todaysEvents, setTodaysEvents] = useState<Event[]>([]);
  const [latestFeeding, setLatestFeeding] = useState<Event | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [activeView, setActiveView] = useState<"dashboard" | "events" | "stats" | "photos">("dashboard");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // Undo system
  const [undoEvent, setUndoEvent] = useState<{ id: string; type: EventType } | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(10);
  const undoIntervalRef = useRef<number | null>(null);
  // Stats range
  const [statsRange, setStatsRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [statsChartType, setStatsChartType] = useState<'feeding' | 'pee' | 'poop'>('feeding');
  const [rangeStats, setRangeStats] = useState<{
    feedings: number; pees: number; poops: number; photos: number;
    avgFeedings: number; avgPees: number; avgPoops: number;
    daysTracked: number; photoStreak: number;
    dailyFeedings: number[]; dailyPees: number[]; dailyPoops: number[]; chartLabels: string[];
  } | null>(null);

  // Photos
  const [photoLoading, setPhotoLoading] = useState(false);
  const [todaysPhoto, setTodaysPhoto] = useState<{ id: string; photo_date: string; photo_path: string; photo_url?: string } | null>(null);
  const [allPhotos, setAllPhotos] = useState<Array<{ id: string; photo_date: string; photo_path: string; photo_url?: string }>>([]);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // URL cache keyed by storage path
  const signedUrlCache = useRef<Map<string, { url: string; expiry: number }>>(new Map());
  // Viewer state
  const [viewerControlsVisible, setViewerControlsVisible] = useState(true);
  // Comments
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Reactions
  const [reactions, setReactions] = useState<PhotoReaction[]>([]);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [allReactions, setAllReactions] = useState<Record<string, PhotoReaction[]>>({});
  // FAB date picker
  const [fabUploadDate, setFabUploadDate] = useState<string>(() => getDateKey(new Date()));
  const [showFabPicker, setShowFabPicker] = useState(false);

  const currentDateKey = getDateKey(currentDate);

  // run loaders when current date key changes, but only after authentication
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!authenticated || !currentBabyId) return;
    loadEvents();
    loadTodaysEvents();
    loadLatestFeeding();
  }, [currentDateKey, authenticated, currentBabyId]);

  // load today's photo for dashboard badge
  useEffect(() => {
    if (!authenticated || !currentBabyId) return;
    const dateKey = currentDateKey;
    (async () => {
      const rec = await getPhotoRecordForDate(dateKey);
      if (!rec) {
        setTodaysPhoto(null);
        return;
      }
      const signed = await getSignedUrlForPath(rec.photo_path);
      setTodaysPhoto({ id: rec.id, photo_date: rec.photo_date, photo_path: rec.photo_path, photo_url: signed });
    })();
  }, [authenticated, currentDateKey, currentBabyId]);

  // (photos view uses gallery loader)

  // load all photos when Photos view active
  useEffect(() => {
    if (!authenticated || !currentBabyId) return;
    if (activeView !== 'photos') return;
    loadAllPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, authenticated, currentBabyId]);

  // load range stats when Stats tab is active or range selection changes
  useEffect(() => {
    if (!authenticated || !currentBabyId) return;
    if (activeView !== 'stats') return;
    void loadRangeStats(statsRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, statsRange, authenticated, currentBabyId]);

  // close FAB picker when navigating away
  useEffect(() => { setShowFabPicker(false); }, [activeView]);

  useEffect(() => {
    if (!authenticated) return;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    if (currentBabyId) return;
    writeAuth(false);
    writeCurrentBaby(null);
    setAuthenticated(false);
    setCurrentBaby(null);
    setCurrentBabyId(null);
  }, [authenticated, currentBabyId]);

  useEffect(() => {
    if (authenticated) return;

    (async () => {
      setBabiesLoading(true);
      const { data, error } = await supabase
        .from("babies")
        .select("id, name, birth_date")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Virhe ladattaessa vauvalistaa:", error);
        setBabies([]);
        setBabiesLoading(false);
        return;
      }

      const rows = (data ?? []) as Baby[];
      setBabies(rows);

      setSelectedBabyId((prev) => {
        if (prev && rows.some((b) => b.id === prev)) return prev;
        return rows[0]?.id ?? "";
      });

      setBabiesLoading(false);
    })();
  }, [authenticated]);

  function logout() {
    writeAuth(false);
    writeCurrentBaby(null);
    setAuthenticated(false);
    setCurrentBaby(null);
    setCurrentBabyId(null);
    setPinInput("");
    setPinError(null);
    setEvents([]);
    setTodaysEvents([]);
    setLatestFeeding(null);
    clearUndoTimer();
    setRangeStats(null);
    setTodaysPhoto(null);
    setAllPhotos([]);
    signedUrlCache.current.clear();
    setAllReactions({});
  }

  async function handleUnlock() {
    const babyId = selectedBabyId;
    const pin = pinInput.trim();

    if (!babyId) {
      setPinError("Valitse vauva");
      return;
    }

    if (!pin) {
      setPinError("Anna PIN");
      return;
    }

    const { data, error } = await supabase
      .from("babies")
      .select("id, name, birth_date, pin")
      .eq("id", babyId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Virhe kirjautumisessa:", error);
      setPinError("Kirjautuminen epäonnistui. Tarkista, että babies-taulu ja data on luotu.");
      return;
    }

    if (!data) {
      setPinError("Vauvaa ei löytynyt");
      return;
    }

    if ((data as any).pin !== pin) {
      setPinError("Väärä PIN");
      return;
    }

    const baby: Baby = {
      id: data.id,
      name: data.name,
      birth_date: data.birth_date,
    };

    writeCurrentBaby(baby);
    writeAuth(true);
    setCurrentBaby(baby);
    setCurrentBabyId(baby.id);
    setAuthenticated(true);
    setPinInput("");
    setPinError(null);
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
    if (!currentBabyId) {
      setEvents([]);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("baby_id", currentBabyId)
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
    if (!currentBabyId) {
      setTodaysEvents([]);
      return;
    }

    const dateKey = currentDateKey;

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("baby_id", currentBabyId)
      .eq("event_date", dateKey)
      .order("event_time", { ascending: true });

    if (error) {
      console.error("Virhe ladattaessa valitun päivän tapahtumia:", error);
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
    if (!currentBabyId) {
      setLatestFeeding(null);
      return;
    }

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("baby_id", currentBabyId)
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

  async function loadRangeStats(range: '7d' | '30d' | 'all') {
    if (!currentBabyId) { setRangeStats(null); return; }

    const endDate = new Date();
    const startDate: Date | null =
      range === '7d'  ? (() => { const d = new Date(); d.setDate(d.getDate() - 6);  return d; })()
    : range === '30d' ? (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d; })()
    : null;

    let evQ = supabase.from('events')
      .select('id,event_type,event_time,event_date')
      .eq('baby_id', currentBabyId)
      .not('event_type', 'eq', 'photo')
      .lte('event_date', getDateKey(endDate));
    if (startDate) evQ = evQ.gte('event_date', getDateKey(startDate));
    const { data: evData } = await evQ;
    const evs: Array<{ id: string; type: EventType; timestamp: string; date: string }> =
      (evData ?? []).map((r: any) => ({ id: r.id, type: r.event_type as EventType, timestamp: r.event_time, date: r.event_date }));

    // Photo streak: consecutive days ending today that have a photo
    const { data: allPhData } = await supabase.from('daily_photos').select('photo_date').eq('baby_id', currentBabyId);
    const allPhSet = new Set<string>((allPhData ?? []).map((r: any) => r.photo_date as string));
    let photoStreak = 0;
    const streakCursor = new Date();
    while (allPhSet.has(getDateKey(streakCursor))) {
      photoStreak++;
      streakCursor.setDate(streakCursor.getDate() - 1);
    }

    let phQ = supabase.from('daily_photos').select('photo_date').eq('baby_id', currentBabyId).lte('photo_date', getDateKey(endDate));
    if (startDate) phQ = phQ.gte('photo_date', getDateKey(startDate));
    const { data: phData } = await phQ;
    const photos = (phData ?? []).length;

    const feedings = evs.filter(e => e.type === 'feeding').length;
    const pees     = evs.filter(e => e.type === 'pee').length;
    const poops    = evs.filter(e => e.type === 'poop').length;
    const uniqueDays = new Set([...evs.map(e => e.date), ...(phData ?? []).map((r: any) => r.photo_date as string)]);
    const daysTracked = uniqueDays.size;
    const div = Math.max(daysTracked, 1);
    const avgFeedings = Math.round((feedings / div) * 10) / 10;
    const avgPees     = Math.round((pees     / div) * 10) / 10;
    const avgPoops    = Math.round((poops    / div) * 10) / 10;

    let chartLabels: string[];
    let dailyFeedings: number[];
    let dailyPees: number[];
    let dailyPoops: number[];
    const DAYS = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];

    if (range === '7d') {
      const keys = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(endDate); d.setDate(endDate.getDate() - (6 - i)); return getDateKey(d);
      });
      chartLabels   = keys.map(k => DAYS[new Date(k + 'T12:00:00').getDay()]);
      dailyFeedings = keys.map(k => evs.filter(e => e.type === 'feeding' && e.date === k).length);
      dailyPees     = keys.map(k => evs.filter(e => e.type === 'pee'     && e.date === k).length);
      dailyPoops    = keys.map(k => evs.filter(e => e.type === 'poop'    && e.date === k).length);

    } else if (range === '30d') {
      const weeks: string[][] = Array.from({ length: 5 }, (_, wi) => {
        const startAgo = (4 - wi) * 6;
        return Array.from({ length: 6 }, (_, di) => {
          const d = new Date(endDate); d.setDate(endDate.getDate() - (startAgo + di)); return getDateKey(d);
        });
      });
      chartLabels   = ['\u20134vk', '\u20133vk', '\u20132vk', '\u20131vk', 'Nyt'];
      dailyFeedings = weeks.map(wk => evs.filter(e => e.type === 'feeding' && wk.includes(e.date)).length);
      dailyPees     = weeks.map(wk => evs.filter(e => e.type === 'pee'     && wk.includes(e.date)).length);
      dailyPoops    = weeks.map(wk => evs.filter(e => e.type === 'poop'    && wk.includes(e.date)).length);

    } else {
      const MONTHS = ['Ta','He','Ma','Hu','To','Ke','He','El','Sy','Lo','Ma','Jo'];
      const monthKeys = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(endDate); d.setMonth(endDate.getMonth() - (5 - i));
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      });
      chartLabels   = monthKeys.map(mk => MONTHS[parseInt(mk.slice(5)) - 1]);
      dailyFeedings = monthKeys.map(mk => evs.filter(e => e.type === 'feeding' && e.date.startsWith(mk)).length);
      dailyPees     = monthKeys.map(mk => evs.filter(e => e.type === 'pee'     && e.date.startsWith(mk)).length);
      dailyPoops    = monthKeys.map(mk => evs.filter(e => e.type === 'poop'    && e.date.startsWith(mk)).length);
    }

    setRangeStats({ feedings, pees, poops, photos, avgFeedings, avgPees, avgPoops, daysTracked, photoStreak, dailyFeedings, dailyPees, dailyPoops, chartLabels });
  }

  // --- Photos helpers ---
  async function getPhotoRecordForDate(dateKey: string) {
    if (!currentBabyId) return null;

    const { data, error } = await supabase
      .from("daily_photos")
      .select("*")
      .eq("baby_id", currentBabyId)
      .eq("photo_date", dateKey)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error loading photo record:", error);
      return null;
    }
    return data as any;
  }

  async function getSignedUrlForPath(path: string) {
    const nowMs = Date.now();
    const cached = signedUrlCache.current.get(path);
    if (cached && cached.expiry > nowMs + 5 * 60 * 1000) return cached.url;
    try {
      const { data } = await supabase.storage.from("daily-photos").createSignedUrl(path, 60 * 60);
      const url = (data as any)?.signedUrl ?? null;
      if (url) signedUrlCache.current.set(path, { url, expiry: nowMs + 60 * 60 * 1000 });
      return url;
    } catch (e) {
      console.error("signed url error", e);
      return cached?.url ?? null;
    }
  }

  

  async function uploadPhotoForDate(file: File, dateKey: string) {
    if (!currentBabyId) {
      setPhotoError('Vauvan tunniste puuttuu. Kirjaudu uudelleen.');
      return null;
    }

    setPhotoLoading(true);
    setPhotoError(null);
    setPhotoMessage(null);
    try {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf('.')) : '.jpg';
      const path = `${currentBabyId}/${dateKey}${ext}`;
      const bucket = 'daily-photos';
      setPhotoMessage('Ladataan...');

      const up = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
      if (up.error) {
        setPhotoError('Kuvan lataus epäonnistui. Yritä uudelleen.');
        setPhotoMessage(null);
        throw up.error;
      }

      // upsert DB record (replaces existing day record)
      const now = new Date().toISOString();
      const { data, error } = await supabase.from('daily_photos').upsert({ baby_id: currentBabyId, photo_date: dateKey, photo_path: path, photo_url: path, created_at: now }, { onConflict: 'baby_id,photo_date' }).select().maybeSingle();
      if (error) {
        setPhotoError('Tallennus epäonnistui. Yritä uudelleen.');
        setPhotoMessage(null);
        throw error;
      }

      const signed = await getSignedUrlForPath(path);
      if (!signed) setPhotoError('Kuvan käsittely epäonnistui.');

      const rec = { id: data?.id ?? '', photo_date: dateKey, photo_path: path, photo_url: signed };
      if (dateKey === currentDateKey) setTodaysPhoto(rec);

      // ensure there's only one photo event per date: remove existing and insert a single photo event
      try {
        await supabase.from('events').delete().eq('baby_id', currentBabyId).eq('event_type', 'photo').eq('event_date', dateKey);
        await supabase.from('events').insert({ baby_id: currentBabyId, event_type: 'photo', event_time: now, event_date: dateKey });
      } catch (e) {
        // ignore
      }

      // refresh gallery
      setPhotoMessage(null);
      await loadAllPhotos();
      setPhotoMessage('Kuva tallennettu');

      if (dateKey === currentDateKey) {
        await loadEvents();
        await loadTodaysEvents();
        await loadLatestFeeding();
      }

      return rec;
    } catch (e) {
      console.error('upload photo failed', e);
      if (!photoError) setPhotoError('Tapahtui virhe. Yritä myöhemmin.');
      setPhotoMessage(null);
      throw e;
    } finally {
      setPhotoLoading(false);
    }
  }

  // Delete photo for a date: remove storage file and DB record
  async function deletePhotoForDate(dateKey: string) {
    if (!currentBabyId) {
      setPhotoError('Vauvan tunniste puuttuu. Kirjaudu uudelleen.');
      return;
    }

    try {
      const rec = await getPhotoRecordForDate(dateKey);
      if (!rec) {
        setPhotoError('Kuvaa ei löytynyt.');
        return;
      }
      // remove storage object
      const { error: remErr } = await supabase.storage.from('daily-photos').remove([rec.photo_path]);
      if (remErr) {
        setPhotoError('Kuvan poisto epäonnistui.');
        throw remErr;
      }
      // remove DB record and any photo event
      const { error: dbErr } = await supabase.from('daily_photos').delete().eq('baby_id', currentBabyId).eq('photo_date', dateKey);
      try {
        await supabase.from('events').delete().eq('baby_id', currentBabyId).eq('event_type', 'photo').eq('event_date', dateKey);
      } catch (_) {}
      if (dbErr) {
        setPhotoError('Kuvan poisto tietokannasta epäonnistui.');
        throw dbErr;
      }
      if (dateKey === currentDateKey) setTodaysPhoto(null);
      await loadAllPhotos();
      setPhotoMessage('Kuva poistettu');
    } catch (err) {
      console.error('delete photo failed', err);
      if (!photoError) setPhotoError('Kuvan poisto epäonnistui. Yritä uudelleen.');
      throw err;
    }
  }

  function clearUndoTimer() {
    if (undoIntervalRef.current !== null) {
      window.clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
  }

  function startUndoTimer(eventId: string, type: EventType) {
    clearUndoTimer();
    setUndoEvent({ id: eventId, type });
    setUndoSecondsLeft(10);
    let s = 10;
    undoIntervalRef.current = window.setInterval(() => {
      s -= 1;
      setUndoSecondsLeft(s);
      if (s <= 0) { clearUndoTimer(); setUndoEvent(null); }
    }, 1000);
  }

  async function handleUndo() {
    if (!undoEvent || !currentBabyId) return;
    const id = undoEvent.id;
    clearUndoTimer();
    setUndoEvent(null);
    await supabase.from('events').delete().eq('id', id).eq('baby_id', currentBabyId);
    await loadEvents();
    await loadTodaysEvents();
    await loadLatestFeeding();
  }

  async function addEvent(type: EventType) {
    if (!currentBabyId) return;
    const ts = new Date().toISOString();
    const { data: inserted, error } = await supabase.from("events").insert({
      baby_id: currentBabyId,
      event_type: type,
      event_time: ts,
      event_date: currentDateKey,
    }).select('id').maybeSingle();

    if (error) {
      console.error("Virhe lisättäessä:", error);
      return;
    }

    await loadEvents();
    await loadTodaysEvents();
    await loadLatestFeeding();
    if (inserted?.id) startUndoTimer(inserted.id, type);
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

  // (formatDurationMs removed — not needed)

  function formatRemainingMs(ms: number) {
    const minutes = Math.ceil(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    const hLabel = hours === 1 ? "tunti" : "tuntia";
    const mLabel = rem === 1 ? "minuutti" : "minuuttia";
    if (hours > 0) return `${hours} ${hLabel} ${rem} ${mLabel}`;
    return `${rem} ${mLabel}`;
  }

  function formatRemainingShort(ms: number) {
    const minutes = Math.ceil(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    if (hours > 0) return `${hours} h ${rem} min`;
    return `${rem} min`;
  }

  // (avg interval calculation removed — not used in UI per UX changes)

  const renderCard = (
    title: string,
    count: number,
    target: number,
    accentColor: string,
    bgColor: string,
    type: EventType
  ) => {
    const latest = getLatestEvent(type);
    const lastFeeding = type === "feeding" ? (latestFeeding ?? latest) : latest;
    const elapsedMs = lastFeeding ? Math.max(0, now.getTime() - new Date(lastFeeding.timestamp).getTime()) : null;
    const progress = Math.min(100, (count / target) * 100);

    return (
      <div className="event-card" style={{ background: bgColor }}>
        <div className="event-card-header">
          <span className="event-card-title">{title}</span>
          <span className="event-card-count">{count}</span>
        </div>

        <div className="event-card-bar-track">
          <div className="event-card-bar" style={{ width: `${progress}%`, background: accentColor }} />
        </div>

        <div className="event-card-meta">
          {latest ? (
            <>klo {formatTime(latest.timestamp)} · {getTimeAgo(latest.timestamp)}</>
          ) : (
            <>Ei tapahtumia</>
          )}
        </div>

        {type === "feeding" && lastFeeding && elapsedMs !== null && (() => {
          const threeH = 3 * 60 * 60 * 1000;
          const remainingMs = Math.max(0, threeH - elapsedMs);
          const nextTime = new Date(new Date(lastFeeding.timestamp).getTime() + threeH).toISOString();
          if (remainingMs > 0) {
            return <div className="event-card-next">Seuraava klo {formatTime(nextTime)} · {formatRemainingMs(remainingMs)}</div>;
          }
          return <div className="event-card-next overdue">Imetys myöhässä</div>;
        })()}

        <div className="event-card-actions">
          {undoEvent?.type === type ? (
            <div className="undo-row">
              <span className="undo-row-text">Lisätty</span>
              <div className="undo-row-track">
                <div className="undo-row-fill" style={{ width: `${(undoSecondsLeft / 10) * 100}%`, background: accentColor }} />
              </div>
              <button className="undo-row-btn" onClick={handleUndo}>Kumoa</button>
              <span className="undo-row-seconds">{undoSecondsLeft}s</span>
            </div>
          ) : (
            <button onClick={() => addEvent(type)} className="event-card-add">+ Lisää</button>
          )}
        </div>
      </div>
    );
  };

  // modal state for photo preview
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPhoto, setModalPhoto] = useState<{ id: string; photo_date: string; photo_path: string; photo_url?: string } | null>(null);

  function openModal(p: { id: string; photo_date: string; photo_path: string; photo_url?: string }) {
    setModalPhoto(p);
    setModalOpen(true);
    setViewerControlsVisible(true);
    void loadComments(p.id);
    void loadReactions(p.id);
  }

  function closeModal() {
    setModalOpen(false);
    setModalPhoto(null);
    setComments([]);
    setReactions([]);
    setCommentInput('');
    setCommentError(null);
    setReactionError(null);
    setEditingCommentId(null);
    setDeleteConfirmId(null);
  }

  async function loadAllPhotos() {
    if (!currentBabyId) { setAllPhotos([]); return; }
    try {
      const { data, error } = await supabase.from('daily_photos').select('*').eq('baby_id', currentBabyId).order('photo_date', { ascending: false });
      if (error) { console.error('loadAllPhotos error', error); setAllPhotos([]); return; }
      const rows = data ?? [];
      if (rows.length === 0) { setAllPhotos([]); return; }
      const nowMs = Date.now();
      const TTL = 60 * 60;
      const uncachedPaths = (rows as any[]).map((r: any) => r.photo_path as string).filter(p => {
        const c = signedUrlCache.current.get(p);
        return !c || c.expiry < nowMs + 5 * 60 * 1000;
      });
      if (uncachedPaths.length > 0) {
        try {
          const { data: signed } = await supabase.storage.from('daily-photos').createSignedUrls(uncachedPaths, TTL);
          (signed ?? []).forEach((s: any) => {
            if (s.signedUrl) signedUrlCache.current.set(s.path, { url: s.signedUrl, expiry: nowMs + TTL * 1000 });
          });
        } catch (_) { /* fall back to individual cached URLs */ }
      }
      const out = (rows as any[]).map((r: any) => ({
        id: r.id as string,
        photo_date: r.photo_date as string,
        photo_path: r.photo_path as string,
        photo_url: signedUrlCache.current.get(r.photo_path as string)?.url ?? undefined,
      }));
      setAllPhotos(out);
      if (out.length > 0) void loadAllReactions(out.map(p => p.id));
    } catch (e) {
      console.error('loadAllPhotos failed', e);
      setAllPhotos([]);
    }
  }

  async function loadComments(photoId: string) {
    if (!currentBabyId) return;
    setCommentsLoading(true);
    const { data } = await supabase
      .from('photo_comments')
      .select('id, photo_id, body, created_at')
      .eq('photo_id', photoId)
      .eq('baby_id', currentBabyId)
      .order('created_at', { ascending: true });
    setComments((data ?? []) as PhotoComment[]);
    setCommentsLoading(false);
  }

  async function loadReactions(photoId: string): Promise<PhotoReaction[]> {
    if (!currentBabyId) return [];
    const { data, error } = await supabase
      .from('photo_reactions')
      .select('id, photo_id, emoji')
      .eq('photo_id', photoId)
      .eq('baby_id', currentBabyId);
    if (error) {
      console.error('loadReactions error:', error.message, error.code, error.details);
      return [];
    }
    const fresh = (data ?? []) as PhotoReaction[];
    setReactions(fresh);
    return fresh;
  }

  async function loadAllReactions(photoIds: string[]) {
    if (!currentBabyId || photoIds.length === 0) { setAllReactions({}); return; }
    const { data, error } = await supabase
      .from('photo_reactions')
      .select('id, photo_id, emoji')
      .in('photo_id', photoIds)
      .eq('baby_id', currentBabyId);
    if (error) {
      console.error('loadAllReactions error:', error.message, error.code, error.details);
      return;
    }
    const map: Record<string, PhotoReaction[]> = {};
    photoIds.forEach(id => { map[id] = []; });
    (data ?? []).forEach((r: any) => {
      if (!map[r.photo_id]) map[r.photo_id] = [];
      map[r.photo_id].push({ id: r.id, photo_id: r.photo_id, emoji: r.emoji });
    });
    setAllReactions(map);
  }

  async function toggleReaction(photoId: string, emoji: string) {
    if (!currentBabyId) return;
    setReactionError(null);
    // Query DB directly — avoids stale closure on `reactions` state
    const { data: existing, error: findErr } = await supabase
      .from('photo_reactions')
      .select('id')
      .eq('photo_id', photoId)
      .eq('baby_id', currentBabyId)
      .eq('emoji', emoji)
      .maybeSingle();
    if (findErr) {
      console.error('toggleReaction find error:', findErr.message, findErr.code, findErr.details);
      setReactionError('Reaktiota ei voitu ladata. Tarkista, että photo_reactions-taulu on luotu ja RLS on pois käytöstä.');
      return;
    }
    if (existing) {
      const { error: delErr } = await supabase.from('photo_reactions').delete().eq('id', existing.id);
      if (delErr) { console.error('toggleReaction delete error:', delErr.message); setReactionError('Poisto epäonnistui.'); return; }
    } else {
      const { error: insErr } = await supabase.from('photo_reactions').insert({ photo_id: photoId, baby_id: currentBabyId, emoji });
      if (insErr) { console.error('toggleReaction insert error:', insErr.message, insErr.code); setReactionError('Reaktion tallennus epäonnistui.'); return; }
    }
    const fresh = await loadReactions(photoId);
    setAllReactions(prev => ({ ...prev, [photoId]: fresh }));
  }

  async function submitComment(photoId: string) {
    const body = commentInput.trim();
    if (!currentBabyId || !body) return;
    setCommentError(null);
    const { error } = await supabase
      .from('photo_comments')
      .insert({ photo_id: photoId, baby_id: currentBabyId, body });
    if (error) {
      console.error('submitComment error:', error.message, error.details, error.hint);
      setCommentError('Kommenttia ei voitu tallentaa. Tarkista yhteys ja yritä uudelleen.');
      return;
    }
    setCommentInput('');
    await loadComments(photoId);
  }

  async function updateComment(commentId: string, photoId: string, newBody: string) {
    const body = newBody.trim();
    if (!currentBabyId || !body) return;
    const { error } = await supabase
      .from('photo_comments')
      .update({ body })
      .eq('id', commentId)
      .eq('baby_id', currentBabyId);
    if (error) {
      console.error('updateComment error:', error.message);
      setCommentError('Kommentin muokkaus epäonnistui.');
      return;
    }
    setEditingCommentId(null);
    setEditingBody('');
    await loadComments(photoId);
  }

  async function deleteComment(commentId: string, photoId: string) {
    if (!currentBabyId) return;
    const { error } = await supabase
      .from('photo_comments')
      .delete()
      .eq('id', commentId)
      .eq('baby_id', currentBabyId);
    if (error) {
      console.error('deleteComment error:', error.message);
      setCommentError('Kommentin poisto epäonnistui.');
      return;
    }
    setDeleteConfirmId(null);
    await loadComments(photoId);
  }

  // If not authenticated, show lock screen only
  if (!authenticated) {
    return (
      <div className="app-root">
        <div className="container">
          <div className="lock-screen">
            <div className="lock-card">
              <img src="/avatar.jpg" alt="Miisa" className="brand-avatar lock-avatar" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/avatar.svg'; }} />
              <div className="page-title">iMiisa</div>
              <div className="lock-prompt">Valitse vauva ja anna PIN</div>
              <select
                className="baby-selector"
                value={selectedBabyId}
                onChange={(e) => {
                  setSelectedBabyId(e.target.value);
                  setPinError(null);
                }}
                aria-label="Vauva"
                disabled={babiesLoading || babies.length === 0}
                style={{ marginBottom: 8 }}
              >
                {babies.length === 0 ? (
                  <option value="">{babiesLoading ? "Ladataan vauvoja..." : "Vauvoja ei löytynyt 💛"}</option>
                ) : (
                  babies.map((baby) => (
                    <option key={baby.id} value={baby.id}>{baby.name}</option>
                  ))
                )}
              </select>
              <input
                className="pin-input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock(); }}
                aria-label="PIN"
                placeholder="••••"
                autoFocus
              />
              <button className="unlock-btn" onClick={() => void handleUnlock()} disabled={babiesLoading || babies.length === 0}>Avaa</button>
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
            onClick={() => setCurrentDate(new Date(currentDate.getTime() - 86400000))}
            className="nav-button"
            aria-label="Edellinen päivä"
          >←</button>

          <div className="header-center">
            <div className="header-date">
              {isToday(currentDate) ? "Tänään" : formatDate(currentDate)}
            </div>
            {currentBaby && (
              <div className="header-baby">
                {currentBaby.name} · {computeAgeDays(birthIso) || "—"}
              </div>
            )}
          </div>

          <div className="header-right">
            <button
              onClick={() => setCurrentDate(new Date(currentDate.getTime() + 86400000))}
              className="nav-button"
              aria-label="Seuraava päivä"
            >→</button>
            <button
              className="nav-button logout-icon-btn"
              onClick={() => setShowLogoutConfirm(true)}
              aria-label="Kirjaudu ulos"
            >⏻</button>
          </div>
        </div>

        {activeView === "dashboard" && (
          <>
            {/* Daily photo hero — primary visual element when photo exists */}
            {todaysPhoto && (
              <div className="photo-hero" onClick={() => openModal(todaysPhoto!)}>
                <img src={todaysPhoto.photo_url ?? ''} alt="Päivän kuva" className="photo-hero-img" decoding="async" />
                <div className="photo-hero-footer">
                  <span className="photo-hero-label">Päivän kuva</span>
                  <span className="photo-hero-date">{isToday(currentDate) ? "Tänään" : formatDate(currentDate)}</span>
                </div>
              </div>
            )}

            {/* Hero card: next feeding countdown + today's counts */}
            <div className="hero-card">
              {(() => {
                const lastFeeding = latestFeeding;
                if (!lastFeeding) return (
                  <div className="hero-no-feeding">Ei imetyksiä vielä tänään</div>
                );
                const threeH = 3 * 60 * 60 * 1000;
                const elapsedMs = Math.max(0, now.getTime() - new Date(lastFeeding.timestamp).getTime());
                const remainingMs = Math.max(0, threeH - elapsedMs);
                const nextTime = new Date(new Date(lastFeeding.timestamp).getTime() + threeH).toISOString();
                const isOverdue = remainingMs === 0;
                return (
                  <div className="hero-feeding">
                    <div className="hero-feeding-label">
                      {isOverdue ? "IMETYS MYÖHÄSSÄ" : "SEURAAVA IMETYS"}
                    </div>
                    <div className={`hero-feeding-time${isOverdue ? " overdue" : ""}`}>
                      {isOverdue ? "Nyt" : formatRemainingShort(remainingMs)}
                    </div>
                    {!isOverdue && (
                      <div className="hero-feeding-clock">klo {formatTime(nextTime)}</div>
                    )}
                  </div>
                );
              })()}

              <div className="hero-counts">
                <div className="hero-count-item">
                  <span className="hero-count-num">{todaysCounts.feedings}</span>
                  <span className="hero-count-label">imetystä</span>
                </div>
                <div className="hero-count-divider" />
                <div className="hero-count-item">
                  <span className="hero-count-num">{todaysCounts.pees}</span>
                  <span className="hero-count-label">pissaa</span>
                </div>
                <div className="hero-count-divider" />
                <div className="hero-count-item">
                  <span className="hero-count-num">{todaysCounts.poops}</span>
                  <span className="hero-count-label">kakkaa</span>
                </div>
              </div>
            </div>

            {/* Event cards */}
            {renderCard("Imetykset", feedingCount, 10, "#6A5AE0", "#F8F6FF", "feeding")}
            {renderCard("Pissat", peeCount, 5, "#60A5FA", "#F0F7FF", "pee")}
            {renderCard("Kakat", poopCount, 1, "#FB923C", "#FFF8F2", "poop")}

            {/* Photo add prompt — subtle, only when no photo for this day */}
            {!todaysPhoto && (
              <label className="photo-add-prompt">
                <span>Lisää päivän kuva</span>
                <span className="photo-add-arrow">→</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={photoLoading}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) { try { await uploadPhotoForDate(f, currentDateKey); } catch (_) {} }
                  }}
                />
              </label>
            )}
            {(photoMessage || photoError) && (
              <div style={{ textAlign: 'center', fontSize: 13, marginBottom: 12, color: photoError ? '#EF4444' : '#6B6B6B' }}>
                {photoError ?? photoMessage}
              </div>
            )}
          </>
        )}
        {activeView === 'stats' && (
          <div className="stats-view">
            <div className="seg-control">
              {(['7d', '30d', 'all'] as const).map(r => (
                <button key={r} className={`seg-btn ${statsRange === r ? 'active' : ''}`} onClick={() => setStatsRange(r)}>
                  {r === '7d' ? '7 pv' : r === '30d' ? '30 pv' : 'Kaikki'}
                </button>
              ))}
            </div>

            {!rangeStats ? (
              <div className="stats-loading">Ladataan...</div>
            ) : (
              <>
                <div className="stats-section-label">Yhteenveto</div>

                <div className="stats-tile-main">
                  <div className="stats-tile-main-label">Imetykset</div>
                  <div className="stats-tile-main-num">{rangeStats.feedings}</div>
                  <div className="stats-tile-main-avg">{rangeStats.avgFeedings} / pv</div>
                </div>

                <div className="stats-2col">
                  <div className="stats-tile-sm">
                    <div className="stats-tile-sm-label">Pissat</div>
                    <div className="stats-tile-sm-num">{rangeStats.pees}</div>
                    <div className="stats-tile-sm-avg">{rangeStats.avgPees} / pv</div>
                  </div>
                  <div className="stats-tile-sm">
                    <div className="stats-tile-sm-label">Kakat</div>
                    <div className="stats-tile-sm-num">{rangeStats.poops}</div>
                    <div className="stats-tile-sm-avg">{rangeStats.avgPoops} / pv</div>
                  </div>
                </div>

                <div className="stats-section-label">Seuranta</div>
                <div className="stats-2col">
                  <div className="stats-tile-sm">
                    <div className="stats-tile-sm-label">Päiviä seurattu</div>
                    <div className="stats-tile-sm-num">{rangeStats.daysTracked}</div>
                  </div>
                  <div className="stats-tile-sm">
                    <div className="stats-tile-sm-label">Kuvaputki</div>
                    <div className="stats-tile-sm-num">{rangeStats.photoStreak}</div>
                    <div className="stats-tile-sm-avg">pv peräkkäin</div>
                  </div>
                </div>

                <div className="stats-section-label">Trendi</div>
                <div className="stats-chart-card">
                  <div className="chart-type-tabs">
                    {(['feeding', 'pee', 'poop'] as const).map(ct => (
                      <button key={ct} className={`chart-type-btn ${statsChartType === ct ? 'active' : ''}`} onClick={() => setStatsChartType(ct)}>
                        {ct === 'feeding' ? 'Imetykset' : ct === 'pee' ? 'Pissat' : 'Kakat'}
                      </button>
                    ))}
                  </div>
                  <div className="chart-bars">
                    {(() => {
                      const arr = statsChartType === 'feeding' ? rangeStats.dailyFeedings : statsChartType === 'pee' ? rangeStats.dailyPees : rangeStats.dailyPoops;
                      const color = statsChartType === 'feeding' ? '#6A5AE0' : statsChartType === 'pee' ? '#60A5FA' : '#FB923C';
                      const max = Math.max(...arr, 1);
                      return arr.map((v, i) => (
                        <div key={i} className="chart-bar-col">
                          <div className="chart-bar-outer">
                            <div className="chart-bar-fill" style={{ height: `${Math.max((v / max) * 100, v > 0 ? 6 : 0)}%`, background: color, opacity: v === 0 ? 0.15 : 1 }} />
                          </div>
                          <div className="chart-bar-label">{rangeStats.chartLabels[i]}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeView === 'photos' && (
          <div className="timeline-view">
            {allPhotos.length === 0 ? (
              <div className="events-empty-state">
                <div className="events-empty-title">Ei kuvia</div>
                <div className="events-empty-body">Lisää ensimmäinen kuva alla olevasta painikkeesta</div>
              </div>
            ) : (
              [...allPhotos]
                .sort((a, b) => b.photo_date.localeCompare(a.photo_date))
                .map(p => {
                  const isT = p.photo_date === getDateKey(new Date());
                  const isY = p.photo_date === getDateKey(new Date(Date.now() - 86400000));
                  const label = isT ? 'Tänään' : isY ? 'Eilen' : p.photo_date.split('-').reverse().join('.');
                  return (
                    <div key={p.id} className="timeline-entry">
                      <div className="timeline-date-label">{label}</div>
                      <div className="timeline-photo-card" onClick={() => openModal(p)}>
                        <img src={p.photo_url ?? ''} alt={label} className="timeline-photo-img" loading="lazy" decoding="async" />
                        {(() => {
                          const pr = allReactions[p.id] ?? [];
                          const active = ['\u2764\ufe0f','\ud83d\ude0d','\ud83e\udd70','\ud83d\ude02'].filter(em => pr.some(r => r.emoji === em));
                          if (active.length === 0) return null;
                          return (
                            <div className="timeline-reaction-bar">
                              {active.map(em => (
                                <span key={em} className="timeline-reaction-pill">
                                  {em} {pr.filter(r => r.emoji === em).length}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })
            )}
            <button
              className={`photo-fab${photoLoading ? ' loading' : ''}`}
              onClick={() => { setFabUploadDate(getDateKey(new Date())); setShowFabPicker(true); }}
              aria-label="Lisää kuva"
            >
              <span className="photo-fab-icon">+</span>
            </button>
            {(photoMessage || photoError) && (
              <div className={`photo-fab-msg${photoError ? ' error' : ''}`}>{photoError ?? photoMessage}</div>
            )}
            {showFabPicker && (
              <div className="fab-picker-overlay" onClick={() => setShowFabPicker(false)}>
                <div className="fab-picker-sheet" onClick={e => e.stopPropagation()}>
                  <div className="fab-picker-title">Lisää kuva</div>
                  <div className="fab-picker-field">
                    <div className="fab-picker-label">Päivämäärä</div>
                    <input
                      type="date"
                      className="fab-picker-date"
                      value={fabUploadDate}
                      max={getDateKey(new Date())}
                      onChange={e => setFabUploadDate(e.target.value)}
                    />
                  </div>
                  <label className={`fab-picker-upload${photoLoading ? ' loading' : ''}`}>
                    {photoLoading ? 'Ladataan…' : 'Valitse kuva'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      disabled={photoLoading}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f || !fabUploadDate) return;
                        try {
                          await uploadPhotoForDate(f, fabUploadDate);
                          setShowFabPicker(false);
                        } catch (_) {}
                      }}
                    />
                  </label>
                  <button className="fab-picker-cancel" onClick={() => setShowFabPicker(false)}>Peruuta</button>
                </div>
              </div>
            )}
          </div>
        )}
        {activeView === 'events' && (
          <div className="events-view">
            {loading ? (
              <div className="events-loading">Ladataan...</div>
            ) : sortedEvents.filter(e => e.type !== 'photo').length === 0 ? (
              <div className="events-empty-state">
                <div className="events-empty-title">Ei tapahtumia</div>
                <div className="events-empty-body">
                  {isToday(currentDate) ? 'Ei kirjattuja tapahtumia tänään' : 'Ei kirjattuja tapahtumia'}
                </div>
              </div>
            ) : (
              (() => {
                const timeGroups = [
                  { key: 'yö',    label: 'Yö',    filter: (h: number) => h < 6 },
                  { key: 'aamu',  label: 'Aamu',  filter: (h: number) => h >= 6 && h < 12 },
                  { key: 'päivä', label: 'Päivä', filter: (h: number) => h >= 12 && h < 18 },
                  { key: 'ilta',  label: 'Ilta',  filter: (h: number) => h >= 18 },
                ];
                return timeGroups.map(group => {
                  const groupEvents = sortedEvents.filter(e =>
                    e.type !== 'photo' && group.filter(new Date(e.timestamp).getHours())
                  );
                  if (groupEvents.length === 0) return null;
                  return (
                    <div key={group.key} className="ev-group">
                      <div className="ev-group-header">
                        <span className="ev-group-name">{group.label}</span>
                        <span className="ev-group-count">{groupEvents.length}</span>
                      </div>
                      {groupEvents.map(event => {
                        const ordinal = sortedEvents
                          .slice(0, sortedEvents.indexOf(event) + 1)
                          .filter(e => e.type === event.type).length;
                        const typeLabel = event.type === 'feeding' ? 'imetys' : event.type === 'poop' ? 'kakka' : 'pissa';
                        const typeColor = event.type === 'feeding' ? '#6A5AE0' : event.type === 'pee' ? '#60A5FA' : '#FB923C';
                        return (
                          <div key={event.id} className="ev-row">
                            <div className="ev-row-dot" style={{ background: typeColor }} />
                            <div className="ev-row-time">{formatTime(event.timestamp)}</div>
                            <div className="ev-row-label">{ordinal}. {typeLabel}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                });
              })()
            )}
          </div>
        )}

        {modalOpen && modalPhoto && (
          <div className="viewer-overlay">
            <div className="viewer-photo-area" onClick={() => setViewerControlsVisible(v => !v)}>
              <img
                src={modalPhoto.photo_url ?? ''}
                alt={formatPhotoDate(modalPhoto.photo_date)}
                className="viewer-photo"
                decoding="async"
              />
              <div className={`viewer-topbar${viewerControlsVisible ? '' : ' hidden'}`}>
                <div className="viewer-topbar-date">{formatPhotoDate(modalPhoto.photo_date)}</div>
                <button className="viewer-close" onClick={(e) => { e.stopPropagation(); closeModal(); }} aria-label="Sulje">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6L18 18"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="viewer-sheet">
              <div className="viewer-reactions">
                {(['\u2764\ufe0f', '\ud83d\ude0d', '\ud83e\udd70', '\ud83d\ude02'] as const).map(emoji => {
                  const reacted = reactions.some(r => r.emoji === emoji);
                  const count = reactions.filter(r => r.emoji === emoji).length;
                  return (
                    <button
                      key={emoji}
                      className={`reaction-btn${reacted ? ' active' : ''}`}
                      onClick={() => void toggleReaction(modalPhoto.id, emoji)}
                    >
                      <span className="reaction-emoji">{emoji}</span>
                      {count > 0 && <span className="reaction-count">{count}</span>}
                    </button>
                  );
                })}
              </div>
              {reactionError && (
                <div className="viewer-comment-error" style={{ marginTop: -8, marginBottom: 16 }}>{reactionError}</div>
              )}

              <div className="viewer-comments-section">
                {commentsLoading ? (
                  <div className="viewer-comments-status">Ladataan...</div>
                ) : comments.length === 0 ? (
                  <div className="viewer-comments-status">Ei kommentteja vielä</div>
                ) : (
                  <div className="viewer-comments-list">
                    {comments.map(c => (
                      <div key={c.id} className="comment-row">
                        {editingCommentId === c.id ? (
                          <div className="comment-edit-form">
                            <input
                              className="viewer-comment-input"
                              value={editingBody}
                              onChange={e => setEditingBody(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') void updateComment(c.id, modalPhoto.id, editingBody);
                                if (e.key === 'Escape') { setEditingCommentId(null); setEditingBody(''); }
                              }}
                              autoFocus
                            />
                            <div className="comment-edit-actions">
                              <button className="comment-action-btn save" onClick={() => void updateComment(c.id, modalPhoto.id, editingBody)} disabled={!editingBody.trim()}>Tallenna</button>
                              <button className="comment-action-btn" onClick={() => { setEditingCommentId(null); setEditingBody(''); }}>Peruuta</button>
                            </div>
                          </div>
                        ) : deleteConfirmId === c.id ? (
                          <div className="comment-delete-confirm">
                            <span className="comment-delete-msg">Poistetaanko kommentti?</span>
                            <div className="comment-edit-actions">
                              <button className="comment-action-btn delete" onClick={() => void deleteComment(c.id, modalPhoto.id)}>Poista</button>
                              <button className="comment-action-btn" onClick={() => setDeleteConfirmId(null)}>Peruuta</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="comment-body">{c.body}</div>
                            <div className="comment-footer">
                              <span className="comment-time">{formatCommentTime(c.created_at)}</span>
                              <div className="comment-meta-actions">
                                <button className="comment-meta-btn" onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body); setDeleteConfirmId(null); }}>Muokkaa</button>
                                <button className="comment-meta-btn delete" onClick={() => { setDeleteConfirmId(c.id); setEditingCommentId(null); }}>Poista</button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="viewer-comment-input-row">
                <input
                  className="viewer-comment-input"
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  placeholder="Kirjoita kommentti…"
                  onKeyDown={(e) => { if (e.key === 'Enter') void submitComment(modalPhoto.id); }}
                />
                <button
                  className="viewer-comment-send"
                  disabled={!commentInput.trim()}
                  onClick={() => void submitComment(modalPhoto.id)}
                >Lähetä</button>
              </div>
              {commentError && (
                <div className="viewer-comment-error">{commentError}</div>
              )}

              <div className="viewer-actions">
                <label className="viewer-action-btn">
                  Vaihda kuva
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={photoLoading}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        try {
                          await uploadPhotoForDate(f, modalPhoto.photo_date);
                          await loadAllPhotos();
                          const rec = await getPhotoRecordForDate(modalPhoto.photo_date);
                          if (rec) {
                            const url = await getSignedUrlForPath(rec.photo_path);
                            const updated = { id: rec.id, photo_date: rec.photo_date, photo_path: rec.photo_path, photo_url: url };
                            if (modalPhoto.photo_date === currentDateKey) setTodaysPhoto(updated);
                            setModalPhoto(updated);
                          }
                        } catch (_) {}
                      }
                    }}
                  />
                </label>
                <button
                  className="viewer-action-btn destructive"
                  onClick={async () => {
                    try {
                      await deletePhotoForDate(modalPhoto.photo_date);
                      closeModal();
                    } catch (_) {}
                  }}
                >Poista kuva</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="bottom-nav">
        <button
          className={`bottom-nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          <svg className="bottom-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 9L12 3L21 9V20H15V14H9V20H3V9Z"/>
          </svg>
          <span className="bottom-nav-label">Yleiskuva</span>
        </button>
        <button
          className={`bottom-nav-item ${activeView === 'events' ? 'active' : ''}`}
          onClick={() => setActiveView('events')}
        >
          <svg className="bottom-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <circle cx="5" cy="7" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="5" cy="17" r="1.5" fill="currentColor" stroke="none"/>
            <path d="M9 7H20M9 12H20M9 17H16"/>
          </svg>
          <span className="bottom-nav-label">Tapahtumat</span>
        </button>
        <button
          className={`bottom-nav-item ${activeView === 'photos' ? 'active' : ''}`}
          onClick={() => setActiveView('photos')}
        >
          <svg className="bottom-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2.5"/>
            <circle cx="12" cy="12" r="3.5"/>
          </svg>
          <span className="bottom-nav-label">Kuvat</span>
        </button>
        <button
          className={`bottom-nav-item ${activeView === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveView('stats')}
        >
          <svg className="bottom-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M6 20V13M12 20V5M18 20V9"/>
          </svg>
          <span className="bottom-nav-label">Tilastot</span>
        </button>
      </nav>

      {showLogoutConfirm && (
        <div className="action-sheet-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="action-sheet-title">Kirjaudu ulos?</div>
            <button
              className="action-sheet-btn destructive"
              onClick={() => { logout(); setShowLogoutConfirm(false); }}
            >Kirjaudu ulos</button>
            <button
              className="action-sheet-btn cancel"
              onClick={() => setShowLogoutConfirm(false)}
            >Peruuta</button>
          </div>
        </div>
      )}
    </div>
  );
}