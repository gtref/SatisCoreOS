function tokenize(source) {
  const compact = source.replace(/\s+/g, "");
  const tokens = compact.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[()+\-*/%]/g) ?? [];
  if (tokens.join("") !== compact) throw new Error("Check the expression and try again.");
  return tokens;
}

export function evaluateExpression(source) {
  if (!source.trim()) throw new Error("Enter an expression first.");
  if (source.length > 100) throw new Error("Expressions can be up to 100 characters.");

  const tokens = tokenize(source);
  let position = 0;

  const parsePrimary = () => {
    const token = tokens[position++];
    if (token === "(") {
      const value = parseExpression();
      if (tokens[position++] !== ")") throw new Error("Close the open parenthesis.");
      return value;
    }
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) {
      throw new Error("Check the expression and try again.");
    }
    return Number(token);
  };

  const parseUnary = () => {
    if (tokens[position] === "+") {
      position++;
      return parseUnary();
    }
    if (tokens[position] === "-") {
      position++;
      return -parseUnary();
    }
    return parsePrimary();
  };

  const parseTerm = () => {
    let value = parseUnary();
    while (["*", "/", "%"].includes(tokens[position])) {
      const operator = tokens[position++];
      const right = parseUnary();
      if ((operator === "/" || operator === "%") && right === 0) {
        throw new Error("Cannot divide by zero.");
      }
      value = operator === "*" ? value * right
        : operator === "/" ? value / right
          : value % right;
      if (!Number.isFinite(value)) throw new Error("The result is too large.");
    }
    return value;
  };

  function parseExpression() {
    let value = parseTerm();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
      if (!Number.isFinite(value)) throw new Error("The result is too large.");
    }
    return value;
  }

  const result = parseExpression();
  if (position !== tokens.length) throw new Error("Check the expression and try again.");
  return Object.is(result, -0) ? 0 : Number(result.toPrecision(12));
}

function mountCalculator(root) {
  root.innerHTML = `<section class="calculator-app" aria-label="Calculator" tabindex="0">
    <header class="calculator-heading"><div><p class="eyebrow">QUICK MATH</p><h2 class="app-heading">Calculator</h2></div><span class="calculator-mark" aria-hidden="true">±</span></header>
    <div class="calculator-display" aria-live="polite" aria-atomic="true">
      <div class="calculator-expression" id="calculator-expression">0</div>
      <div class="calculator-result" id="calculator-result">Ready</div>
    </div>
    <div class="calculator-keys" aria-label="Calculator keys">
      <button type="button" class="calculator-key calculator-clear" data-action="clear">AC</button>
      <button type="button" class="calculator-key" data-action="delete" aria-label="Delete last character">⌫</button>
      <button type="button" class="calculator-key" data-action="parentheses" aria-label="Parentheses">()</button>
      <button type="button" class="calculator-key calculator-operator" data-value="/" aria-label="Divide">÷</button>
      <button type="button" class="calculator-key" data-value="7">7</button>
      <button type="button" class="calculator-key" data-value="8">8</button>
      <button type="button" class="calculator-key" data-value="9">9</button>
      <button type="button" class="calculator-key calculator-operator" data-value="*" aria-label="Multiply">×</button>
      <button type="button" class="calculator-key" data-value="4">4</button>
      <button type="button" class="calculator-key" data-value="5">5</button>
      <button type="button" class="calculator-key" data-value="6">6</button>
      <button type="button" class="calculator-key calculator-operator" data-value="-" aria-label="Subtract">−</button>
      <button type="button" class="calculator-key" data-value="1">1</button>
      <button type="button" class="calculator-key" data-value="2">2</button>
      <button type="button" class="calculator-key" data-value="3">3</button>
      <button type="button" class="calculator-key calculator-operator" data-value="+" aria-label="Add">+</button>
      <button type="button" class="calculator-key" data-value="%">%</button>
      <button type="button" class="calculator-key" data-value="0">0</button>
      <button type="button" class="calculator-key" data-value=".">.</button>
      <button type="button" class="calculator-key calculator-equals" data-action="equals">=</button>
    </div>
    <p class="calculator-hint">Use your keyboard · Enter to calculate · Esc to clear</p>
  </section>`;

  const app = root.querySelector(".calculator-app");
  const expressionDisplay = root.querySelector("#calculator-expression");
  const resultDisplay = root.querySelector("#calculator-result");
  let expression = "";
  let lastResult = "";
  let calculated = false;

  const render = (message = "Ready", isError = false) => {
    expressionDisplay.textContent = expression || "0";
    resultDisplay.textContent = message;
    resultDisplay.classList.toggle("is-error", isError);
  };
  const append = value => {
    if (calculated) {
      if (/^[\d.(]$/.test(value)) expression = "";
      else expression = lastResult;
      calculated = false;
    }
    expression += value;
    render(" ");
  };
  const calculate = () => {
    try {
      const result = evaluateExpression(expression);
      lastResult = String(result);
      calculated = true;
      render(`= ${lastResult}`);
    } catch (error) {
      render(error.message, true);
    }
  };

  app.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "clear") {
      expression = "";
      lastResult = "";
      calculated = false;
      render("Ready");
    } else if (button.dataset.action === "delete") {
      if (calculated) {
        expression = lastResult;
        calculated = false;
      }
      expression = expression.slice(0, -1);
      render(" ");
    } else if (button.dataset.action === "parentheses") {
      const opens = (expression.match(/\(/g) ?? []).length;
      const closes = (expression.match(/\)/g) ?? []).length;
      const endsWithValue = /[\d.)]$/.test(expression);
      append(opens > closes && endsWithValue ? ")" : "(");
    } else if (button.dataset.action === "equals") {
      calculate();
    } else if (button.dataset.value) {
      append(button.dataset.value);
    }
  });

  app.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[\d.+\-*/%()]$/.test(event.key)) {
      event.preventDefault();
      append(event.key);
    } else if (event.key === "Enter" || event.key === "=") {
      event.preventDefault();
      calculate();
    } else if (event.key === "Backspace") {
      event.preventDefault();
      if (calculated) {
        expression = lastResult;
        calculated = false;
      }
      expression = expression.slice(0, -1);
      render(" ");
    } else if (event.key === "Escape") {
      event.preventDefault();
      expression = "";
      lastResult = "";
      calculated = false;
      render("Ready");
    }
  });

  app.focus();
}

export const calculatorApp = Object.freeze({
  id: "calculator",
  name: "Calculator",
  icon: "±",
  description: "Do quick calculations with a keyboard-friendly calculator.",
  mount: mountCalculator
});
