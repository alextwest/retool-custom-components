import { useAppTheme } from "./theme";
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

const getScheduleConfidence = (
  event: CalendarEvent,
  scheduleConfidenceField: string
) => String(event?.[scheduleConfidenceField] ?? "confirmed").trim().toLowerCase();

const getEventStyleForConfidence = (
  event: CalendarEvent,
  scheduleConfidenceField: string,
  color: string
): React.CSSProperties => {
  const confidence = getScheduleConfidence(event, scheduleConfidenceField);

  if (confidence === "tentative") {
    return {
      background: "transparent",
      color: "var(--app-text, #000)",
      border: `2px dashed ${color}`
    };
  }

  return {
    background: color,
    color: "#000",
    border: `1px solid ${color}`
  };
};

const getEventTooltip = (
  event: CalendarEvent,
  titleField: string,
  scheduleConfidenceField: string
) => {
  const title = String(event?.[titleField] ?? "Untitled");
  const confidence = getScheduleConfidence(event, scheduleConfidenceField);
  const status = confidence === "tentative" ? "Tentative schedule" : "Confirmed schedule";

  return `${title}\n${status}`;
};

export const CalendarWrapper: React.FC = () => {
  const appThemeStyle = useAppTheme();
  const [calendarEventDataRaw] = Retool.useStateArray({
      name: "calendarEventData",
      initialValue: []
    });
  
  const calendarEventData =
    calendarEventDataRaw as unknown as CalendarEvent[];
  
  const [crewsDataRaw] = Retool.useStateArray({
    name: "crewsData",
    initialValue: []
  });
  
  const crewsData =
    crewsDataRaw as unknown as Crew[];

  const [, setSelectedEventString] = Retool.useStateString({ name: "selectedWhiteboardEvent", initialValue: "" });
  const [, setSelectedRowString] = Retool.useStateString({ name: "selectedRow", initialValue: "" });

  const [selectedTimeZone] = Retool.useStateString({ name: "selectedTimeZone", initialValue: "UTC" });

  const [startField] = Retool.useStateString({ name: "startField", initialValue: "start" });
  const [endField] = Retool.useStateString({ name: "endField", initialValue: "end" });
  const [titleField] = Retool.useStateString({ name: "titleField", initialValue: "title" });
  const [resourceField] = Retool.useStateString({ name: "resourceField", initialValue: "resource_id" });
  const [crewNameField] = Retool.useStateString({ name: "crewNameField", initialValue: "crew_name" });
  const [scheduleConfidenceField] = Retool.useStateString({ name: "scheduleConfidence", initialValue: "scheduleConfidence" });

  const [includeServiceTitan, setIncludeServiceTitan] = Retool.useStateBoolean({
    name: "includeServiceTitan", initialValue: true
  });
  const [serviceTitanCrewField] = Retool.useStateString({
    name: "serviceTitanCrewField", initialValue: "serviceTitanCrew"
  });

  const TZ = selectedTimeZone || "UTC";

  const onWhiteboardEventClick = Retool.useEventCallback({ name: "onWhiteboardEventClick" });
  const onWhiteboardCellSelect = Retool.useEventCallback({ name: "onWhiteboardCellSelect" });

  const [currentDate, setCurrentDate] = useState(() =>
    moment().tz(TZ)
  );
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
  }, [calendarEventData, crewsData, currentDate]);

  return (
    <div ref={wrapperRef} style={{ ...appThemeStyle, padding: 12, background: "var(--app-canvas, #f8f9fb)" }}>
      <WhiteboardView
        events={calendarEventData}
        includeServiceTitan={includeServiceTitan}
        setIncludeServiceTitan={setIncludeServiceTitan}
        serviceTitanCrewField={serviceTitanCrewField}
        crews={crewsData}
        TZ={TZ}
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        setSelectedRowString={setSelectedRowString}
        setSelectedEventString={setSelectedEventString}
        onEventClick={onWhiteboardEventClick}
        onCellSelect={onWhiteboardCellSelect}
        startField={startField}
        endField={endField}
        titleField={titleField}
        resourceField={resourceField}
        crewNameField={crewNameField}
        scheduleConfidenceField={scheduleConfidenceField}
      />
    </div>
  );
};

const WhiteboardView = ({
  events: allEvents,
  includeServiceTitan,
  setIncludeServiceTitan,
  serviceTitanCrewField,
  crews,
  TZ,
  currentDate,
  setCurrentDate,
  setSelectedEventString,
  onEventClick,
  onCellSelect,
  startField,
  endField,
  titleField,
  resourceField,
  crewNameField,
  scheduleConfidenceField
}: any) => {

  const [viewMode, setViewMode] = useState("week");
  const [serviceTitanCollapsed, setServiceTitanCollapsed] = useState(false);
  const normalizeSource = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const isServiceTitan = (event: CalendarEvent) => {
    const serviceCrew = crews?.find((crew: Crew) =>
      String(crew.id) === String(event[resourceField]) || crew.name === event[crewNameField]);
    return [event.source, event.platform, event[resourceField], event[crewNameField], serviceCrew?.name]
      .some(value => normalizeSource(value) === "servicetitan");
  };
  const events = allEvents.filter((event: CalendarEvent) => includeServiceTitan || !isServiceTitan(event));
  // Keep original event objects intact for Retool click callbacks.
  const serviceCrewName = (event: CalendarEvent) => {
    const value = event[serviceTitanCrewField];
    return typeof value === "string" || typeof value === "number"
      ? String(value).trim() || "Unassigned" : "Unassigned";
  };
  const serviceCrewNames: string[] = Array.from(new Set<string>(
    events.filter(isServiceTitan).map(serviceCrewName)
  )).sort((a, b) => a.localeCompare(b));
  const displayCrews = [
    ...crews.filter((crew: Crew) => normalizeSource(crew.name) !== "servicetitan" && normalizeSource(crew.id) !== "servicetitan")
      .map((crew: Crew) => ({ ...crew, serviceTitan: false })),
    ...serviceCrewNames.map(name => ({ id: `servicetitan:${name}`, name, serviceTitan: true }))
  ];
  const matchesCrew = (event: CalendarEvent, crew: Crew & { serviceTitan?: boolean }) =>
    crew.serviceTitan
      ? isServiceTitan(event) && serviceCrewName(event) === crew.name
      : !isServiceTitan(event) && (event[resourceField] === crew.id || event[crewNameField] === crew.name);
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
    return moment(currentDate).tz(TZ);
  }, [currentDate, TZ]);

  const weekCount =
    viewMode === "week" ? 1 :
    viewMode === "2weeks" ? 2 :
    viewMode === "3weeks" ? 3 :
    null;

  const weeks = weekCount
    ? Array.from({ length: weekCount }, (_, i) =>
        baseDate.clone().add(i, "week").startOf("isoWeek")
      )
    : (() => {
        const start = baseDate.clone().startOf("month").startOf("isoWeek");
        const end = baseDate.clone().endOf("month").endOf("isoWeek");

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
  }, [viewMode, weeks.length, allEvents, crews, includeServiceTitan, serviceTitanCollapsed]);

  // Defining toolbar as a variable to be reused and always showing
  const toolbar = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {baseDate.format("MMMM YYYY")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <label style={{ ...segmentedContainer, alignItems: "center", padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={includeServiceTitan}
            onChange={event => setIncludeServiceTitan(event.target.checked)}
            style={{ accentColor: "var(--app-primary, #2563eb)" }} />
          Include ServiceTitan
        </label>

        {/* LEFT GROUP */}
        <div style={segmentedContainer}>
          <button
            style={segBtn}
            onClick={() => {
              setCurrentDate((previous: moment.Moment) =>
                previous.clone().subtract(
                  1,
                  viewMode === "month" || viewMode === "list"
                    ? "month"
                    : "week"
                )
              );
            }}
          >
            ‹
          </button>

          <button
            style={{
              ...segBtn,
              fontWeight: 600,
              padding: "6px 18px"
            }}
            onClick={() => setCurrentDate(moment().tz(TZ))}
          >
            Today
          </button>

          <button
            style={segBtn}
            onClick={() => {
              setCurrentDate((previous: moment.Moment) =>
                previous.clone().add(
                  1,
                  viewMode === "month" || viewMode === "list"
                    ? "month"
                    : "week"
                )
              );
            }}
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
    const days = Array.from({ length: monthEnd.date() }, (_, i) =>
      monthStart.clone().add(i, "day")
    ).filter(day => day.isoWeekday() <= 5);

    const listEvents =
      events
        ?.filter((ev: CalendarEvent) => {
          const start = safeDate(ev[startField]);
          const end = safeDate(ev[endField]);
          if (!start || !end) return false;

          return days.some(day => day.isBetween(start, end, "day", "[]"));
        })
        .sort((a: CalendarEvent, b: CalendarEvent) => {
          const aStart = safeDate(a[startField]);
          const bStart = safeDate(b[startField]);
          return (aStart?.valueOf() || 0) - (bStart?.valueOf() || 0);
        }) || [];

    return (
      <div style={{ padding: 20 }}>
        {toolbar}

        {listEvents.length === 0 ? (
          <div
            style={{
              marginTop: 20,
              padding: 24,
              textAlign: "center",
              color: "var(--app-muted, #6b7280)",
              background: "var(--app-secondary, #f9fafb)",
              border: "1px solid var(--app-border, #e5e7eb)",
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
                    <span style={{ fontWeight: 400, color: "var(--app-muted, #6b7280)" }}>
                      {day.format("dddd")}
                    </span>
                  </div>

                  {dayEvents.map((ev: CalendarEvent) => {
                    const color =
                      ev.color ||
                      colorMap[ev[resourceField]] ||
                      "var(--app-primary, #2563eb)";
                    const eventStyle = getEventStyleForConfidence(ev, scheduleConfidenceField, color);
                    const eventTooltip = getEventTooltip(ev, titleField, scheduleConfidenceField);

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
                          <span
                            title={eventTooltip}
                            style={{
                              display: "inline-block",
                              borderRadius: 6,
                              padding: "2px 8px",
                              ...eventStyle
                            }}
                          >
                            {String(ev[titleField] ?? "Untitled")}
                          </span>
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
    <div style={{ background: "var(--app-secondary, #f3f4f6)", padding: 16 }}>

      {toolbar}

      {weeks.map((weekStart, wi) => {
        const weekEnd = weekStart.clone().add(4, "days").endOf("day");

        return (
          <div key={wi} style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>
              {weekStart.format("MMM D")} - {weekEnd.format("MMM D")}
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "160px repeat(5, 1fr)",
              border: "1px solid var(--app-border, #e5e7eb)",
              background: "var(--app-surface, #fff)"
            }}>

              <div style={{ ...headerCell, borderRight: "1px solid var(--app-border, #e5e7eb)" }}>CREW</div>

              {Array.from({ length: 5 }).map((_, i) => {
                const d = weekStart.clone().add(i, "days");
                const isToday = d.format("YYYY-MM-DD") === today;

                return (
                  <div key={i} style={{
                    ...headerCell,
                    borderLeft: "1px solid var(--app-border, #eee)",
                    background: isToday ? "var(--app-selected, #eef2ff)" : "var(--app-surface, #fff)"
                  }}>
                    {d.format("ddd")}
                    <div style={{
                      marginTop: 2,
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: isToday ? "var(--app-primary, #2563eb)" : "transparent",
                      color: isToday ? "var(--app-on-primary, #fff)" : "var(--app-text, #000)",
                      marginInline: "auto",
                      fontWeight: 700,
                      lineHeight: "26px"
                    }}>
                      {d.format("DD")}
                    </div>
                  </div>
                );
              })}

              {displayCrews.filter((crew: Crew & { serviceTitan?: boolean }) => {
                return events?.some((ev: CalendarEvent) => {
                  const start = safeDate(ev[startField]);
                  const end = safeDate(ev[endField]);

                  if (!start || !end) return false;

                  const matches = matchesCrew(ev, crew);

                  const visibleThisWeek =
                    !end.isBefore(weekStart) &&
                    !start.isAfter(weekEnd);

                  return matches && visibleThisWeek;
                });
              }).map((crew: Crew & { serviceTitan?: boolean }, crewIndex: number, visibleCrews: (Crew & { serviceTitan?: boolean })[]) => {

                const crewEvents = events
                  ?.map((ev: CalendarEvent) => {
                    const start = safeDate(ev[startField]);
                    const end = safeDate(ev[endField]);
                    if (!start || !end) return null;

                    const matches = matchesCrew(ev, crew);

                    if (!matches) return null;
                    if (end.isBefore(weekStart) || start.isAfter(weekEnd)) return null;

                    const renderStart = moment.max(start, weekStart).clone().startOf("day");
                    const renderEnd = moment.min(end, weekEnd).clone().startOf("day");

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
                    {crew.serviceTitan && !visibleCrews[crewIndex - 1]?.serviceTitan && (
                      <button type="button" aria-expanded={!serviceTitanCollapsed}
                        onClick={() => setServiceTitanCollapsed(value => !value)}
                        style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10,
                          textAlign: "left", padding: "12px 10px", cursor: "pointer",
                          background: "var(--app-selected, #eef2ff)", color: "var(--app-text, #111827)",
                          border: "none", borderTop: "1px solid var(--app-border, #e5e7eb)", fontWeight: 700 }}>
                        <span aria-hidden="true">{serviceTitanCollapsed ? "\u25b8" : "\u25be"}</span>
                        ServiceTitan
                        <span style={{ fontSize: 12, fontWeight: 400 }}>
                          {visibleCrews.filter(row => row.serviceTitan).length} crews / {events.filter((event: CalendarEvent) => {
                            const start = safeDate(event[startField]);
                            const end = safeDate(event[endField]);
                            return isServiceTitan(event) && start && end && !end.isBefore(weekStart) && !start.isAfter(weekEnd);
                          }).length} appointments
                        </span>
                      </button>
                    )}
                    {(!crew.serviceTitan || !serviceTitanCollapsed) && <>
                    <div style={{
                      ...crewCell,
                      borderRight: "1px solid var(--app-border, #e5e7eb)"
                    }}>
                      {crew.name}
                      {crew.serviceTitan && <div style={{ marginTop: 4, fontSize: 11, color: "var(--app-muted, #6b7280)" }}>ServiceTitan / {crewEvents.length} appointments</div>}
                    </div>

                    <div style={{
                      gridColumn: "span 5",
                      position: "relative",
                      height: rowHeight,
                      borderTop: "1px solid var(--app-border, #eee)",
                      overflow: "hidden",
                      padding: "2px 0"
                    }}>

                      <div style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        display: "grid",
                        gridTemplateColumns: "repeat(5,1fr)"
                      }}>
                        {Array.from({ length: 5 }).map((_, i) => {
                          const d = weekStart.clone().add(i, "days");
                          const isToday = d.format("YYYY-MM-DD") === today;

                          return (
                            <div
                              key={i}
                              style={{
                                borderLeft: i ? "1px solid var(--app-border, #f0f0f0)" : "none",
                                background: isToday ? "var(--app-secondary, #f8fafc)" : "transparent",
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
                            "var(--app-primary, #2563eb)";
                          const eventStyle = getEventStyleForConfidence(
                            e.ev,
                            scheduleConfidenceField,
                            color
                          );
                          const eventTooltip = getEventTooltip(
                            e.ev,
                            titleField,
                            scheduleConfidenceField
                          );

                          return (
                            <div
                              key={i}
                              title={eventTooltip}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedEventString(e.ev);
                                //setSelectedEventString(JSON.stringify(e.ev));
                                onEventClick?.(e.ev);
                              }}
                              style={{
                                position: "absolute",
                                top: 4 + li * 30,
                                left: `calc(${e.startIdx * (100 / 5)}% + 2px)`,
                                width: `calc(${e.span * (100 / 5)}% - 4px)`,
                                height: 22,
                                ...eventStyle,
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
                    </>}
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

const btnLight: React.CSSProperties = {
  background: "var(--app-surface, #fff)",
  border: "1px solid var(--app-border, #d1d5db)",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer"
};

const btnActive: React.CSSProperties = {
  ...btnLight,
  background: "var(--app-primary, #2563eb)",
  color: "var(--app-on-primary, #fff)",
  border: "1px solid var(--app-primary, #2563eb)"
};

const headerCell: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid var(--app-border, #eee)",
  textAlign: "center",
  fontSize: 12,
  fontWeight: 600
};

const crewCell: React.CSSProperties = {
  padding: 10,
  borderTop: "1px solid var(--app-border, #eee)",
  fontSize: 13,
  fontWeight: 500
};

const segmentedContainer: React.CSSProperties = {
  display: "flex",
  background: "var(--app-surface, #FFFFFF)",
  padding: 4,
  borderRadius: 14,
  border: "1px solid var(--app-border, #e2e8f0)",
  gap: 4
};

const segBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: "6px 12px",
  borderRadius: 10,
  fontSize: 13,
  cursor: "pointer",
  color: "var(--app-muted, #475569)",
  transition: "all 0.2s ease"
};

const activeSegBtn: React.CSSProperties = {
  ...segBtn,
  background: "var(--app-primary, #2563eb)",
  color: "var(--app-on-primary, #fff)",
  fontWeight: 600,
  boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
};
