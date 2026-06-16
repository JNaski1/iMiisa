import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

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
  return date.toISOString().split("T")[0];
}

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEvents, setShowEvents] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);

  const currentDateKey = getDateKey(currentDate);

  useEffect(() => {
    loadEvents();
  }, [currentDateKey]);

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

  const renderCard = (
    emoji: string,
    title: string,
    count: number,
    target: number,
    color: string,
    type: EventType
  ) => (
    <div
      style={{
        background: color,
        borderRadius: "28px",
        padding: "22px",
        marginBottom: "18px",
        boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        <span style={{ fontSize: "32px" }}>{emoji}</span>

        <span
          style={{
            fontSize: "24px",
            fontWeight: 700,
          }}
        >
          {title}
        </span>
      </div>

      <div
        style={{
          fontSize: "54px",
          fontWeight: 800,
          textAlign: "center",
        }}
      >
        {count}
        <span
          style={{
            fontSize: "28px",
            color: "#666",
          }}
        >
          {" "}
          / {target}
        </span>
      </div>

      <div
        style={{
          height: "10px",
          background: "rgba(255,255,255,0.5)",
          borderRadius: "999px",
          overflow: "hidden",
          marginTop: "16px",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(
              100,
              (count / target) * 100
            )}%`,
            background: "#222",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "18px",
          marginTop: "20px",
        }}
      >
        <button onClick={() => removeLatestEvent(type)}>
          −
        </button>

        <button onClick={() => addEvent(type)}>
          +
        </button>
      </div>
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "20px",
        background:
          "linear-gradient(180deg,#f8f9ff 0%,#eef3ff 100%)",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <button
            onClick={() =>
              setCurrentDate(
                new Date(
                  currentDate.getTime() - 86400000
                )
              )
            }
          >
            ←
          </button>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 800,
                marginBottom: "10px",
              }}
            >
              👶 Miisa
            </div>

            <div>{formatDate(currentDate)}</div>
          </div>

          <button
            onClick={() =>
              setCurrentDate(
                new Date(
                  currentDate.getTime() + 86400000
                )
              )
            }
          >
            →
          </button>
        </div>

        <div
          style={{
            background: safetyOk
              ? "#22c55e"
              : "#ef4444",
            color: "white",
            borderRadius: "20px",
            padding: "20px",
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          <h2>
            {safetyOk
              ? "😊 Turvamerkit täyttyvät"
              : "⚠️ Turvamerkit eivät täyty"}
          </h2>
        </div>

        {renderCard(
          "💩",
          "Kakat",
          poopCount,
          1,
          "#fff3df",
          "poop"
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
          "🍼",
          "Imetykset",
          feedingCount,
          10,
          "#efe7ff",
          "feeding"
        )}

        <div
          style={{
            background: "white",
            borderRadius: "24px",
            padding: "18px",
          }}
        >
          <button
            onClick={() =>
              setShowEvents(!showEvents)
            }
          >
            📋 Päivän tapahtumat
          </button>

          {showEvents && (
            <div style={{ marginTop: "16px" }}>
              {loading ? (
                <p>Ladataan...</p>
              ) : sortedEvents.length === 0 ? (
                <p>Ei tapahtumia.</p>
              ) : (
                sortedEvents.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      padding: "10px 0",
                    }}
                  >
                    <span>
                      {iconForType(event.type)}
                    </span>

                    <span>
                      {formatTime(event.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}