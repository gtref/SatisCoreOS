import { escapeHtml } from "./app-utils.js";

const STORAGE_KEY = "satiscoreos-calendar-events";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function readEvents() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  const events = JSON.parse(raw);
  if (!events || typeof events !== "object" || Array.isArray(events) ||
      Object.entries(events).some(([date, items]) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(items) ||
        items.some(item => typeof item !== "string")
      )) {
    throw new Error("Saved calendar data has an unsupported format.");
  }
  return events;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mountCalendar(root, api) {
  let visibleMonth = new Date();
  let selectedDate = new Date();
  let events;
  try {
    events = readEvents();
  } catch (error) {
    api.ui.notify(error.message, { type: "error" });
    events = {};
  }

  root.innerHTML = `<section class="calendar-app">
    <header class="calendar-heading"><div><p class="eyebrow">YOUR DAYS, AT A GLANCE</p><h2 class="app-heading">Calendar</h2></div>
      <div class="calendar-navigation"><button class="icon-button" data-month="-1" aria-label="Previous month">‹</button><button class="icon-button" data-month="1" aria-label="Next month">›</button></div></header>
    <div class="calendar-month" id="calendar-month"></div>
    <div class="calendar-grid" id="calendar-grid" role="grid" aria-label="Calendar days"></div>
    <section class="calendar-events" aria-label="Selected day events"><h3 id="calendar-selected"></h3>
      <ul class="calendar-event-list" id="calendar-event-list"></ul>
      <form class="calendar-add-event"><input name="event" maxlength="100" placeholder="Add a plan..." aria-label="New event"><button class="button button-primary" type="submit">Add</button></form>
    </section>
  </section>`;

  const monthLabel = root.querySelector("#calendar-month");
  const grid = root.querySelector("#calendar-grid");
  const selectedLabel = root.querySelector("#calendar-selected");
  const eventList = root.querySelector("#calendar-event-list");

  const render = () => {
    const todayKey = dateKey(new Date());
    const activeKey = dateKey(selectedDate);
    monthLabel.textContent = visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    grid.innerHTML = WEEKDAYS.map(day => `<span class="calendar-weekday" role="columnheader">${day}</span>`).join("");
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    for (let index = 0; index < 42; index++) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = dateKey(date);
      const inMonth = date.getMonth() === visibleMonth.getMonth();
      const hasEvents = Boolean(events[key]?.length);
      grid.insertAdjacentHTML("beforeend", `<button type="button" class="calendar-day ${inMonth ? "" : "is-outside"} ${key === todayKey ? "is-today" : ""} ${key === activeKey ? "is-selected" : ""} ${hasEvents ? "has-events" : ""}" data-date="${key}" role="gridcell" aria-label="${escapeHtml(date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}${hasEvents ? `, ${events[key].length} event${events[key].length === 1 ? "" : "s"}` : ""}" aria-pressed="${key === activeKey}">${date.getDate()}</button>`);
    }
    selectedLabel.textContent = selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    eventList.innerHTML = (events[activeKey] ?? []).map((item, index) => `<li><span>${escapeHtml(item)}</span><button type="button" class="icon-button" data-remove-event="${index}" aria-label="Remove ${escapeHtml(item)}">×</button></li>`).join("")
      || `<li class="calendar-empty">Nothing planned yet.</li>`;
  };

  root.addEventListener("click", event => {
    const monthButton = event.target.closest("[data-month]");
    if (monthButton) {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + Number(monthButton.dataset.month), 1);
      const lastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
      selectedDate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), Math.min(selectedDate.getDate(), lastDay), 12);
      render();
      return;
    }
    const dayButton = event.target.closest("[data-date]");
    if (dayButton) {
      selectedDate = new Date(`${dayButton.dataset.date}T12:00:00`);
      visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      render();
      return;
    }
    const removeButton = event.target.closest("[data-remove-event]");
    if (removeButton) {
      const key = dateKey(selectedDate);
      const index = Number(removeButton.dataset.removeEvent);
      const [removedEvent] = events[key].splice(index, 1);
      if (!events[key].length) delete events[key];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
        render();
      } catch (error) {
        events[key] ??= [];
        events[key].splice(index, 0, removedEvent);
        api.ui.notify(`Calendar change could not be saved: ${error.message}`, { type: "error" });
      }
    }
  });
  root.querySelector(".calendar-add-event").addEventListener("submit", event => {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("event");
    const value = input.value.trim();
    if (!value) return;
    const key = dateKey(selectedDate);
    events[key] ??= [];
    events[key].push(value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
      input.value = "";
      render();
    } catch (error) {
      events[key].pop();
      if (!events[key].length) delete events[key];
      api.ui.notify(`Calendar change could not be saved: ${error.message}`, { type: "error" });
    }
  });
  render();
}

export const calendarApp = Object.freeze({
  id: "calendar",
  name: "Calendar",
  icon: "▦",
  description: "See the month and keep track of simple daily plans.",
  mount: mountCalendar
});
