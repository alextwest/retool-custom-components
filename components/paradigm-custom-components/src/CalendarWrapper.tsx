import React, { useMemo, useState, useRef, useEffect } from "react";
import { Retool } from "@tryretool/custom-component-support";
import moment from "moment-timezone";

type CalendarEvent = Record<string, any>;

interface Crew {
  id: string;
  name: string;
}

const getCrewColor = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = (Math.abs(hash) * 137.508) % 360;
  const saturation = 65 + (Math.abs(hash) % 15);
  const lightness = 50 + (Math.abs(hash >> 2) % 10);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

export const CalendarWrapper: React.FC = () => {
  const [calendarEventData] = Retool.useStateArray<CalendarEvent>({ name: "calendarEventData" });
  const [crewsData] = Retool.useStateArray<Crew>({ name: "crewsData" });

  const [, setSelectedEventString] = Retool.useStateString({ name: "selectedWhiteboardEvent", initialValue: "" });
  const [, setSelectedRowString] = Retool.useStateString({ name: "selectedRow", initialValue: "" });

  const [selectedTimeZone] = Retool.useStateString({ name: "selectedTimeZone", initialValue: "UTC" });

  const [startField] = Retool.useStateString({ name: "startField", initialValue: "start" });
  const [endField] = Retool.useStateString({ name: "endField", initialValue: "end" });
  const [titleField] = Retool.useStateString({ name: "titleField", initialValue: "title" });
  const [resourceField] = Retool.useStateString({ name: "resourceField", initialValue: "resource_id" });
  const [crewNameField] = Retool.useStateString({ name: "crewNameField", initialValue: "crew_name" });

  const TZ = selectedTimeZone || "UTC";

  const onWhiteboardEventClick = Retool.useEventCallback({ name: "onWhiteboardEventClick" });
  const onWhiteboardCellSelect = Retool.useEventCallback({ name: "onWhiteboardCellSelect" });

  const [monthOffset, setMonthOffset] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const resize = () => {
      if (!wrapperRef.current) return;
      const height = wrapperRef.current.scrollHeight;
      if ((Retool as any)?.resize) (Retool as any).resize(height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [calendarEventData, crewsData, monthOffset]);

  return (
    <div ref={wrapperRef} style={{ padding: 12, background: "#f8f9fb" }}>
      <WhiteboardView
        events={calendarEventData}
        crews={crewsData}
        TZ={TZ}
        monthOffset={monthOffset}
        setMonthOffset={setMonthOffset}
        setSelectedRowString={setSelectedRowString}
        setSelectedEventString={setSelectedEventString}
        onEventClick={onWhiteboardEventClick}
        onCellSelect={onWhiteboardCellSelect}
        startField={startField}
        endField={endField}
        titleField={titleField}
        resourceField={resourceField}
        crewNameField={crewNameField}
      />
    </div>
  );
};

const WhiteboardView = ({
  events,
  crews,
  TZ,
  monthOffset,
  setMonthOffset,
  setSelectedEventString,
  onEventClick,
  onCellSelect,
  startField,
  endField,
  titleField,
  resourceField,
  crewNameField
}: any) => {

  const [viewMode, setViewMode] = useState("week");
  const today = moment().tz(TZ).format("YYYY-MM-DD");

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};

    crews?.forEach((c: Crew) => {
      const color = getCrewColor(c.id || c.name);
      map[c.id] = color;
      map[c.name] = color;
    });

    events?.forEach((e: any) => {
      const eventColor = e.color;
      const resourceValue = e[resourceField];
      const crewNameValue = e[crewNameField];

      if (eventColor) {
        if (resourceValue) map[resourceValue] = eventColor;
        if (crewNameValue) map[crewNameValue] = eventColor;
      }
    });

    return map;
  }, [crews, events, resourceField, crewNameField]);

  const safeDate = (val: any) => {
    const m = moment.tz(val, TZ);
    return m.isValid() ? m : null;
  };

  const baseDate = useMemo(() => {
    return moment().tz(TZ).add(
      monthOffset,
      viewMode === "month" ? "months" : "weeks"
    );
  }, [monthOffset, viewMode, TZ]);

  const weekCount =
    viewMode === "week" ? 1 :
    viewMode === "2weeks" ? 2 :
    viewMode === "3weeks" ? 3 :
    null;

  const weeks = weekCount
    ? Array.from({ length: weekCount }, (_, i) =>
        baseDate.clone().add(i, "week").startOf("week")
      )
    : (() => {
        const start = baseDate.clone().startOf("month").startOf("week");
        const end = baseDate.clone().endOf("month").endOf("week");

        const weeks = [];
        let current = start.clone();

        while (current.isSameOrBefore(end)) {
          weeks.push(current.clone());
          current.add(1, "week");
        }

        return weeks;
      })();

  // Resize Retool iframe on content change
  useEffect(() => {
    setTimeout(() => {
      const height =
        document.getElementById("root")?.scrollHeight ||
        document.body.scrollHeight;

      if ((Retool as any)?.resize) {
        (Retool as any).resize(height + 24);
      }
    }, 100);
  }, [viewMode, weeks.length, events, crews]);

  // Defining toolbar as a variable to be reused and always showing
  const toolbar = (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {baseDate.format("MMMM YYYY")}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>

        {/* LEFT GROUP */}
        <div style={segmentedContainer}>
          <button
            style={segBtn}
            onClick={() => setMonthOffset(p => p - 1)}
          >
            ‹
          </button>

          <button
            style={{
              ...segBtn,
              fontWeight: 600,
              padding: "6px 18px"
            }}
            onClick={() => setMonthOffset(0)}
          >
            Today
          </button>

          <button
            style={segBtn}
            onClick={() => setMonthOffset(p => p + 1)}
          >
            ›
          </button>
        </div>

        {/* RIGHT GROUP */}
        <div style={segmentedContainer}>
          <button
            style={viewMode === "week" ? activeSegBtn : segBtn}
            onClick={() => setViewMode("week")}
          >
            Week
          </button>

          <button
            style={viewMode === "2weeks" ? activeSegBtn : segBtn}
            onClick={() => setViewMode("2weeks")}
          >
            2 Weeks
          </button>

          <button
            style={viewMode === "3weeks" ? activeSegBtn : segBtn}
            onClick={() => setViewMode("3weeks")}
          >
            3 Weeks
          </button>

          <button
            style={viewMode === "month" ? activeSegBtn : segBtn}
            onClick={() => setViewMode("month")}
          >
            Month
          </button>

          <button
            style={viewMode === "list" ? activeSegBtn : segBtn}
            onClick={() => setViewMode("list")}
          >
            List
          </button>
        </div>

      </div>
    </div>
  );

  // Adding list view to see all projects per month
  if (viewMode === "list") {
    const monthStart = baseDate.clone().startOf("month");
    const monthEnd = baseDate.clone().endOf("month");

    const listEvents =
      events
        ?.filter((ev: CalendarEvent) => {
          const start = safeDate(ev[startField]);
          const end = safeDate(ev[endField]);
          if (!start || !end) return false;

          return !end.isBefore(monthStart) && !start.isAfter(monthEnd);
        })
        .sort((a: CalendarEvent, b: CalendarEvent) => {
          const aStart = safeDate(a[startField]);
          const bStart = safeDate(b[startField]);
          return (aStart?.valueOf() || 0) - (bStart?.valueOf() || 0);
        }) || [];

    const days = Array.from({ length: monthEnd.date() }, (_, i) =>
      monthStart.clone().add(i, "day")
    );

    return (
      <div style={{ padding: 20 }}>
        {toolbar}

        {listEvents.length === 0 ? (
          <div
            style={{
              marginTop: 20,
              padding: 24,
              textAlign: "center",
              color: "#6b7280",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8
            }}
          >
            No projects scheduled for this month.
          </div>
        ) : (
          <>
            {days.map(day => {
              const dayEvents = listEvents.filter((ev: CalendarEvent) => {
                const start = safeDate(ev[startField]);
                const end = safeDate(ev[endField]);
                if (!start || !end) return false;

                return day.isBetween(start, end, "day", "[]");
              });

              if (!dayEvents.length) return null;

              return (
                <div key={day.format("YYYY-MM-DD")} style={{ marginBottom: 22 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>
                    {day.format("MMMM D, YYYY")}{" "}
                    <span style={{ fontWeight: 400, color: "#6b7280" }}>
                      {day.format("dddd")}
                    </span>
                  </div>

                  {dayEvents.map((ev: CalendarEvent) => {
                    const color =
                      ev.color ||
                      colorMap[ev[resourceField]] ||
                      "#2563eb";

                    return (
                      <div
                        key={`${ev.id}-${day.format("YYYY-MM-DD")}`}
                        onClick={() => {
                          setSelectedEventString(JSON.stringify(ev));
                          onEventClick?.(ev);
                        }}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "160px 1fr",
                          gap: 16,
                          alignItems: "center",
                          marginBottom: 10,
                          cursor: "pointer"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              width: 5,
                              height: 24,
                              borderRadius: 4,
                              background: color
                            }}
                          />
                          <span>All-Day</span>
                        </div>

                        <div style={{ fontWeight: 700 }}>
                          {String(ev[titleField] ?? "Untitled")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "#f3f4f6", padding: 16 }}>

      {toolbar}

      {weeks.map((weekStart, wi) => {
        const weekEnd = weekStart.clone().add(6, "days");

        return (
          <div key={wi} style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>
              {weekStart.format("MMM D")} - {weekEnd.format("MMM D")}
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "160px repeat(7, 1fr)",
              border: "1px solid #e5e7eb",
              background: "#fff"
            }}>

              <div style={{ ...headerCell, borderRight: "1px solid #e5e7eb" }}>CREW</div>

              {Array.from({ length: 7 }).map((_, i) => {
                const d = weekStart.clone().add(i, "days");
                const isToday = d.format("YYYY-MM-DD") === today;

                return (
                  <div key={i} style={{
                    ...headerCell,
                    borderLeft: "1px solid #eee",
                    background: isToday ? "#eef2ff" : "#fff"
                  }}>
                    {d.format("ddd")}
                    <div style={{
                      marginTop: 2,
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: isToday ? "#2563eb" : "transparent",
                      color: isToday ? "#fff" : "#000",
                      marginInline: "auto",
                      fontWeight: 700,
                      lineHeight: "26px"
                    }}>
                      {d.format("DD")}
                    </div>
                  </div>
                );
              })}

              {crews?.filter((crew: Crew) => {
                return events?.some((ev: CalendarEvent) => {
                  const start = safeDate(ev[startField]);
                  const end = safeDate(ev[endField]);

                  if (!start || !end) return false;

                  const matchesCrew =
                    ev[resourceField] === crew.id ||
                    ev[crewNameField] === crew.name;

                  const visibleThisWeek =
                    !end.isBefore(weekStart) &&
                    !start.isAfter(weekEnd);

                  return matchesCrew && visibleThisWeek;
                });
              }).map((crew: Crew) => {

                const crewEvents = events
                  ?.map((ev: CalendarEvent) => {
                    const start = safeDate(ev[startField]);
                    const end = safeDate(ev[endField]);
                    if (!start || !end) return null;

                    const matches =
                      ev[resourceField] === crew.id ||
                      ev[crewNameField] === crew.name;

                    if (!matches) return null;
                    if (end.isBefore(weekStart) || start.isAfter(weekEnd)) return null;

                    const renderStart = moment.max(start, weekStart);
                    const renderEnd = moment.min(end, weekEnd);

                    return {
                      ev,
                      startIdx: renderStart.diff(weekStart, "days"),
                      span: renderEnd.diff(renderStart, "days") + 1
                    };
                  })
                  .filter(Boolean)
                  .sort((a: any, b: any) => a.startIdx - b.startIdx);

                const lanes: any[] = [];

                crewEvents.forEach((e: any) => {
                  let placed = false;
                  for (let i = 0; i < lanes.length; i++) {
                    const last = lanes[i][lanes[i].length - 1];
                    if (e.startIdx >= last.startIdx + last.span) {
                      lanes[i].push(e);
                      placed = true;
                      break;
                    }
                  }
                  if (!placed) lanes.push([e]);
                });

                const rowHeight = Math.max(44, lanes.length * 30 + 8);

                return (
                  <React.Fragment key={crew.id}>
                    <div style={{
                      ...crewCell,
                      borderRight: "1px solid #e5e7eb"
                    }}>
                      {crew.name}
                    </div>

                    <div style={{
                      gridColumn: "span 7",
                      position: "relative",
                      height: rowHeight,
                      borderTop: "1px solid #eee",
                      overflow: "hidden",
                      padding: "2px 0"
                    }}>

                      <div style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        display: "grid",
                        gridTemplateColumns: "repeat(7,1fr)"
                      }}>
                        {Array.from({ length: 7 }).map((_, i) => {
                          const d = weekStart.clone().add(i, "days");
                          const isToday = d.format("YYYY-MM-DD") === today;

                          return (
                            <div
                              key={i}
                              style={{
                                borderLeft: i ? "1px solid #f0f0f0" : "none",
                                background: isToday ? "#f8fafc" : "transparent",
                                cursor: "pointer"
                              }}
                              onClick={() => {
                                onCellSelect?.({
                                  crewId: crew.id,
                                  crewName: crew.name,
                                  date: d.format("YYYY-MM-DD")
                                });
                              }}
                            />
                          );
                        })}
                      </div>

                      {lanes.map((lane: any[], li: number) =>
                        lane.map((e: any, i: number) => {
                          const color =
                            e.ev.color ||
                            colorMap[crew.id] ||
                            colorMap[crew.name] ||
                            "#2563eb";
                          const dayWidth = 100 / 7;
                          const gap = 2;

                          return (
                            <div
                              key={i}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedEventString(e.ev);
                                //setSelectedEventString(JSON.stringify(e.ev));
                                onEventClick?.(e.ev);
                              }}
                              style={{
                                position: "absolute",
                                top: 4 + li * 30,
                                left: `calc(${e.startIdx * (100 / 7)}% + 2px)`,
                                width: `calc(${e.span * (100 / 7)}% - 4px)`,
                                height: 22,
                                background: color,
                                color: "#000",
                                borderRadius: 6,
                                padding: "2px 8px",
                                fontSize: 11,
                                display: "flex",
                                alignItems: "center",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                                cursor: "pointer",
                                boxSizing: "border-box"
                              }}
                            >
                              {String(e.ev[titleField] ?? "Untitled")}
                            </div>
                          );
                        })
                      )}

                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const btnLight = {
  background: "#fff",
  border: "1px solid #d1d5db",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer"
};

const btnActive = {
  ...btnLight,
  background: "#2563eb",
  color: "#fff",
  border: "1px solid #2563eb"
};

const headerCell = {
  padding: 10,
  borderBottom: "1px solid #eee",
  textAlign: "center",
  fontSize: 12,
  fontWeight: 600
};

const crewCell = {
  padding: 10,
  borderTop: "1px solid #eee",
  fontSize: 13,
  fontWeight: 500
};

const segmentedContainer = {
  display: "flex",
  background: "#FFFFFF",
  padding: 4,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  gap: 4
};

const segBtn = {
  border: "none",
  background: "transparent",
  padding: "6px 12px",
  borderRadius: 10,
  fontSize: 13,
  cursor: "pointer",
  color: "#475569",
  transition: "all 0.2s ease"
};

const activeSegBtn = {
  ...segBtn,
  background: "#2563eb",
  color: "#fff",
  fontWeight: 600,
  boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
};