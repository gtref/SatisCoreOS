const UNITS = {
  length: {
    name: "Length",
    units: {
      mm: { label: "Millimeters", factor: 0.001 },
      cm: { label: "Centimeters", factor: 0.01 },
      m: { label: "Meters", factor: 1 },
      km: { label: "Kilometers", factor: 1000 },
      in: { label: "Inches", factor: 0.0254 },
      ft: { label: "Feet", factor: 0.3048 },
      mi: { label: "Miles", factor: 1609.344 }
    }
  },
  mass: {
    name: "Weight",
    units: {
      mg: { label: "Milligrams", factor: 0.000001 },
      g: { label: "Grams", factor: 0.001 },
      kg: { label: "Kilograms", factor: 1 },
      oz: { label: "Ounces", factor: 0.028349523125 },
      lb: { label: "Pounds", factor: 0.45359237 }
    }
  },
  temperature: {
    name: "Temperature",
    units: {
      c: { label: "Celsius" },
      f: { label: "Fahrenheit" },
      k: { label: "Kelvin" }
    }
  }
};

function convertTemperature(value, from, to) {
  const celsius = from === "f" ? (value - 32) * 5 / 9
    : from === "k" ? value - 273.15
      : value;
  return to === "f" ? celsius * 9 / 5 + 32
    : to === "k" ? celsius + 273.15
      : celsius;
}

function mountConverter(root) {
  root.innerHTML = `<section class="converter-app">
    <header class="converter-heading"><div><p class="eyebrow">EVERYDAY CONVERSIONS</p><h2 class="app-heading">Unit Converter</h2></div><span class="converter-mark" aria-hidden="true">⇄</span></header>
    <label class="converter-field">Category<select id="converter-category"><option value="length">Length</option><option value="mass">Weight</option><option value="temperature">Temperature</option></select></label>
    <label class="converter-field">Amount<input id="converter-amount" type="number" step="any" value="1" inputmode="decimal"></label>
    <div class="converter-units"><label class="converter-field">From<select id="converter-from"></select></label><span aria-hidden="true">→</span><label class="converter-field">To<select id="converter-to"></select></label></div>
    <output class="converter-result" id="converter-result" aria-live="polite"></output>
    <button class="text-button converter-swap" id="converter-swap" type="button">⇅ Swap units</button>
  </section>`;

  const category = root.querySelector("#converter-category");
  const amount = root.querySelector("#converter-amount");
  const from = root.querySelector("#converter-from");
  const to = root.querySelector("#converter-to");
  const result = root.querySelector("#converter-result");

  const update = () => {
    const value = Number(amount.value);
    if (amount.value === "" || !Number.isFinite(value)) {
      result.textContent = "Enter a valid amount.";
      return;
    }
    const units = UNITS[category.value].units;
    const converted = category.value === "temperature"
      ? convertTemperature(value, from.value, to.value)
      : value * units[from.value].factor / units[to.value].factor;
    const formatted = Number(converted.toPrecision(10)).toLocaleString(undefined, { maximumSignificantDigits: 10 });
    result.textContent = `${amount.value} ${from.value} = ${formatted} ${to.value}`;
  };

  const updateUnits = () => {
    const units = UNITS[category.value].units;
    const options = Object.entries(units).map(([key, unit]) => `<option value="${key}">${unit.label} (${key})</option>`).join("");
    from.innerHTML = options;
    to.innerHTML = options;
    to.selectedIndex = Math.min(1, to.options.length - 1);
    update();
  };

  category.addEventListener("change", updateUnits);
  amount.addEventListener("input", update);
  from.addEventListener("change", update);
  to.addEventListener("change", update);
  root.querySelector("#converter-swap").addEventListener("click", () => {
    const previousFrom = from.value;
    from.value = to.value;
    to.value = previousFrom;
    update();
  });
  updateUnits();
}

export const converterApp = Object.freeze({
  id: "converter",
  name: "Unit Converter",
  icon: "⇄",
  description: "Convert common length, weight, and temperature units.",
  mount: mountConverter
});
