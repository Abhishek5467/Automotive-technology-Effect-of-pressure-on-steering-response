// src/explain.js
// Explanation / typing animation module
// Exports: initExplanation({plots}) to attach behaviour to plots module

export function initExplanation({ plots }) {
  // steps array: each step has text and optional actions
  const steps = [
    {
      title: "Magic Formula — overview",
      text: `Magic Formula (lateral):
Fy(α) = D * sin( C * atan( Bα - E * (Bα - atan(Bα)) ) )
Where:
  α = slip angle (rad)
  B = stiffness factor
  C = shape factor
  D = peak factor (≈ μ * Fz)
  E = curvature factor

This curve describes how lateral force grows with slip angle.`,
      highlight: { charts: ["alphaFy"], annotate: "linear" },
    },
    {
      title: "Parameter B — stiffness",
      text: `B controls the initial slope near α=0.
Higher B -> steeper slope (higher cornering stiffness).
Lower B -> softer tire (less yaw per degree).`,
      highlight: { charts: ["alphaFy", "deltaYaw"], annotate: "origin" },
    },
    {
      title: "Parameter C — shape",
      text: `C modifies the shape of the curve (how rounded the peak is).
C affects the smoothness between linear and saturated zones.`,
      highlight: { charts: ["alphaFy"], annotate: "shape" },
    },
    {
      title: "Parameter D — peak",
      text: `D is the peak possible lateral force (D ≈ μ * Fz).
Larger D -> greater ultimate grip; small D -> early saturation.`,
      highlight: { charts: ["alphaFy", "ayDelta"], annotate: "peak" },
    },
    {
      title: "Parameter E — curvature",
      text: `E controls how sharply the curve transitions towards the peak.
E near 0 -> smooth; E positive -> sharper peak and drop-off.`,
      highlight: { charts: ["alphaFy", "mzAlpha"], annotate: "nonlinear" },
    },
    {
      title: "How your input shape maps",
      text: `Your steering waveform (constant -> ramp up -> ramp down -> return) sweeps α from + to -.
Look for:
- linear near origin (B matters)
- curvature toward peak (C,E)
- saturation (D)
- hysteresis if you sweep repeatedly`,
      highlight: { charts: ["time", "alphaFy", "deltaYaw"], annotate: "sweep" },
    },
    {
      title: "Interactive experimentation",
      text: `Adjust B,C,D,E sliders to see:
- how the α vs Fy curve shifts
- how yaw response and lateral accel change
This helps parameter identification and intuition.`,
      highlight: {
        charts: ["alphaFy", "deltaYaw", "pressureCalpha"],
        annotate: null,
      },
    },
  ];

  // DOM references
  const textEl = document.getElementById("explain-text");
  const btnNext = document.getElementById("explain-next");
  const btnPrev = document.getElementById("explain-prev");
  const btnPlay = document.getElementById("explain-playpause");
  const btnHighlight = document.getElementById("explain-highlight");
  const sliders = {
    B: document.getElementById("slider-B"),
    C: document.getElementById("slider-C"),
    D: document.getElementById("slider-D"),
    E: document.getElementById("slider-E"),
  };

  let stepIndex = 0;
  let typing = true;
  let typingJob = null;
  let highlightsOn = true;

  // Magic Formula JS function (vectorized)
  function magicFormula(alphaRad, B, C, D, E) {
    // alpha: array or number
    const compute = (a) => {
      const Bx = B * a;
      const inner = Bx - E * (Bx - Math.atan(Bx));
      return D * Math.sin(C * Math.atan(inner));
    };
    if (Array.isArray(alphaRad)) return alphaRad.map(compute);
    return compute(alphaRad);
  }

  // expose to plots module
  if (plots && plots.setMagicFormulaFn) {
    plots.setMagicFormulaFn(magicFormula);
  }

  // typing animation function
  function typeText(fullText, speed = 18) {
    if (typingJob) {
      clearInterval(typingJob);
      typingJob = null;
    }
    textEl.innerText = "";
    let i = 0;
    const cursorSpan = document.createElement("span");
    cursorSpan.className = "cursor";
    textEl.appendChild(cursorSpan); // start with cursor
    // we will build text inside a span before cursor
    const span = document.createElement("span");
    textEl.insertBefore(span, cursorSpan);

    typingJob = setInterval(() => {
      if (!typing) return; // paused
      if (i >= fullText.length) {
        clearInterval(typingJob);
        typingJob = null;
        return;
      }
      span.textContent += fullText[i++];
      // scroll into view
      textEl.scrollTop = textEl.scrollHeight;
    }, speed);
  }

  // show step
  function showStep(index) {
    stepIndex = Math.max(0, Math.min(steps.length - 1, index));
    const s = steps[stepIndex];
    // set text (typing)
    if (typingJob) {
      clearInterval(typingJob);
      typingJob = null;
    }
    typeText(s.text);
    // highlight charts according to step
    if (plots && highlightsOn) {
      plots.clearHighlights();
      if (s.highlight && s.highlight.charts)
        plots.highlightCharts(s.highlight.charts, s.highlight.annotate);
    }
  }

  // next/prev handlers
  btnNext.addEventListener("click", () => showStep(stepIndex + 1));
  btnPrev.addEventListener("click", () => showStep(stepIndex - 1));
  btnPlay.addEventListener("click", () => {
    typing = !typing;
    btnPlay.textContent = typing ? "Pause typing" : "Resume typing";
  });
  btnHighlight.addEventListener("click", () => {
    highlightsOn = !highlightsOn;
    if (!highlightsOn) plots.clearHighlights();
    else showStep(stepIndex); // reapply
    btnHighlight.textContent = highlightsOn
      ? "Toggle Plot Highlights"
      : "Show Highlights";
  });

  // slider interactions: update MF overlay in plots
  const onSliderChange = () => {
    const B = parseFloat(sliders.B.value);
    const C = parseFloat(sliders.C.value);
    const D = parseFloat(sliders.D.value);
    const E = parseFloat(sliders.E.value);
    if (plots && plots.updateMFOverlay) plots.updateMFOverlay({ B, C, D, E });
  };
  Object.values(sliders).forEach((s) =>
    s.addEventListener("input", onSliderChange)
  );

  // initialize default overlay
  onSliderChange();

  // start with first step
  showStep(0);
  // ------------------------------------------------------
  // DRAGGABLE EXPLANATION PANEL
  // ------------------------------------------------------
  (function makePanelDraggable() {
    const panel = document.getElementById("explain-panel");

    const header = document.getElementById("explain-header");

    header.style.cursor = "grab";

    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      header.style.cursor = "grabbing";

      const rect = panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      panel.style.left = `${e.clientX - offsetX}px`;
      panel.style.top = `${e.clientY - offsetY}px`;
    });

    window.addEventListener("mouseup", () => {
      isDragging = false;
      card.style.cursor = "grab";
    });
  })();

  return {
    goToStep: (n) => showStep(n),
    setTyping: (v) => {
      typing = !!v;
    },
    getParams: () => ({
      B: parseFloat(sliders.B.value),
      C: parseFloat(sliders.C.value),
      D: parseFloat(sliders.D.value),
      E: parseFloat(sliders.E.value),
    }),
  };
}
