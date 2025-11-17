// src/plots.js — CLEAN, OPTIMIZED, IMPROVED VERSION
import Chart from "chart.js/auto";

export function createPlots(sim) {
  //------------------------------------------------------
  // 1. Get all canvas contexts
  //------------------------------------------------------
  function ctx(id) {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`Canvas #${id} not found`);
      return null;
    }
    return el.getContext("2d");
  }

  const ctxAlphaFy = ctx("plot-alpha-fy");
  const ctxDeltaYaw = ctx("plot-delta-yaw");
  const ctxTime = ctx("plot-time");
  const ctxPressureCalpha = ctx("plot-pressure-calpha");
  const ctxMzAlpha = ctx("plot-mz-alpha");
  const ctxAyDelta = ctx("plot-ay-delta");
  const ctxUnder = ctx("plot-understeer");
  const ctxPressureYaw = ctx("plot-pressure-yawgain");

  //------------------------------------------------------
  // 2. Create charts
  //------------------------------------------------------

  const chartAlphaFy = new Chart(ctxAlphaFy, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Measured α vs Fy",
          data: [],
          pointRadius: 2,
          borderWidth: 0,
        },
        {
          label: "Magic Formula (model)",
          data: [],
          type: "line",
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 0,
        },
      ],
    },
    options: {
      animation: false,
      scales: {
        x: { title: { display: true, text: "Slip angle α (deg)" } },
        y: { title: { display: true, text: "Lateral force Fy (N)" } },
      },
    },
  });

  const chartDeltaYaw = new Chart(ctxDeltaYaw, {
    type: "scatter",
    data: { datasets: [{ label: "δ vs r", data: [] }] },
    options: {
      animation: false,
      scales: {
        x: { title: { display: true, text: "Steering δ (deg)" } },
        y: { title: { display: true, text: "Yaw rate r (deg/s)" } },
      },
    },
  });

  const chartTime = new Chart(ctxTime, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Steer δ", data: [], tension: 0.2 },
        { label: "Yaw r", data: [], tension: 0.2 },
        { label: "ay", data: [], tension: 0.2 },
      ],
    },
    options: {
      animation: false,
      scales: { x: { title: { display: true, text: "Time (s)" } } },
    },
  });

  const chartMzAlpha = new Chart(ctxMzAlpha, {
    type: "scatter",
    data: { datasets: [{ label: "Mz vs α", data: [] }] },
    options: { animation: false },
  });

  const chartAyDelta = new Chart(ctxAyDelta, {
    type: "scatter",
    data: { datasets: [{ label: "ay vs δ", data: [] }] },
    options: { animation: false },
  });

  const chartPressureCalpha = new Chart(ctxPressureCalpha, {
    type: "line",
    data: { labels: [], datasets: [{ label: "Estimated Cα", data: [] }] },
    options: { animation: false },
  });

  const chartPressureYaw = new Chart(ctxPressureYaw, {
    type: "line",
    data: { labels: [], datasets: [{ label: "Yaw Gain", data: [] }] },
    options: { animation: false },
  });

  const chartUndersteer = new Chart(ctxUnder, {
    type: "line",
    data: { labels: [], datasets: [{ label: "Ku", data: [] }] },
    options: { animation: false },
  });

  //------------------------------------------------------
  // 3. Magic Formula overlay
  //------------------------------------------------------
  let magicFormulaFn = null;
  let mfParams = { B: 40, C: 1.2, D: 9000, E: 0.2 };

  function setMagicFormulaFn(fn) {
    magicFormulaFn = fn;
    updateMFOverlay(mfParams);
  }

  function updateMFOverlay(params) {
    if (!magicFormulaFn) return;

    mfParams = params;

    const alphasDeg = Array.from({ length: 161 }, (_, i) => -20 + i * 0.25);
    const alphasRad = alphasDeg.map((a) => (a * Math.PI) / 180);

    const Fy = magicFormulaFn(
      alphasRad,
      params.B,
      params.C,
      params.D,
      params.E
    );

    chartAlphaFy.data.datasets[1].data = alphasDeg.map((a, i) => ({
      x: a,
      y: Fy[i],
    }));

    chartAlphaFy.update("none");
  }

  //------------------------------------------------------
  // 4. Highlighting API
  //------------------------------------------------------
  const chartMap = {
    alphaFy: chartAlphaFy,
    deltaYaw: chartDeltaYaw,
    time: chartTime,
    pressureCalpha: chartPressureCalpha,
    mzAlpha: chartMzAlpha,
    ayDelta: chartAyDelta,
    pressureYaw: chartPressureYaw,
    understeer: chartUndersteer,
  };

  function highlightCharts(targetNames = [], annotation = null) {
    Object.values(chartMap).forEach((chart) => {
      chart.canvas.style.opacity = 0.25;
    });

    targetNames.forEach((name) => {
      const chart = chartMap[name];
      if (chart) chart.canvas.style.opacity = 1.0;
    });

    // Annotation (linear region highlight)
    if (annotation === "linear") {
      addLinearRegionAnnotation();
    } else {
      removeLinearRegionAnnotation();
    }
  }

  function addLinearRegionAnnotation() {
    // Only add if enabled
    const band = Array.from({ length: 4 }).map((_, i) => ({
      x: i < 2 ? -5 : 5,
      y: i % 2 === 0 ? -1e6 : 1e6,
    }));

    chartAlphaFy.data.datasets[2] = {
      label: "Linear Region",
      data: band,
      type: "line",
      borderWidth: 0,
      backgroundColor: "rgba(180,180,255,0.12)",
      pointRadius: 0,
      fill: "+1",
    };

    chartAlphaFy.update();
  }

  function removeLinearRegionAnnotation() {
    if (chartAlphaFy.data.datasets[2]) {
      chartAlphaFy.data.datasets.splice(2, 1);
      chartAlphaFy.update();
    }
  }

  function clearHighlights() {
    Object.values(chartMap).forEach((c) => (c.canvas.style.opacity = 1.0));
    removeLinearRegionAnnotation();
  }

  //------------------------------------------------------
  // 5. Main update from sim
  //------------------------------------------------------
  function update() {
    const buf = sim.buf;

    chartAlphaFy.data.datasets[0].data = buf.slipFL.map((a, i) => ({
      x: a,
      y: buf.FyFL[i],
    }));
    chartAlphaFy.update("none");

    chartDeltaYaw.data.datasets[0].data = buf.delta.map((d, i) => ({
      x: d,
      y: buf.yaw[i],
    }));
    chartDeltaYaw.update("none");

    chartTime.data.labels = buf.time.map((t) => t.toFixed(2));
    chartTime.data.datasets[0].data = buf.delta;
    chartTime.data.datasets[1].data = buf.yaw;
    chartTime.data.datasets[2].data = buf.ay;
    chartTime.update("none");

    chartMzAlpha.data.datasets[0].data = buf.slipFL.map((a, i) => ({
      x: a,
      y: buf.MzFL[i],
    }));
    chartMzAlpha.update("none");

    chartAyDelta.data.datasets[0].data = buf.delta.map((d, i) => ({
      x: d,
      y: buf.ay[i],
    }));
    chartAyDelta.update("none");

    // pressure-based charts handled by pressure sweep module
  }

  //------------------------------------------------------
  // 6. Export public API
  //------------------------------------------------------
  return {
    update,
    updateMFOverlay,
    setMagicFormulaFn,
    highlightCharts,
    clearHighlights,
    runPressureSweep: async function () {
      const pressures = [];
      for (let p = 20; p <= 40; p += 2) pressures.push(p);

      const results = [];

      // Temporary steering amplitude for excitation
      const SWEEP_STEER = 3; // degrees
      const SETTLE_TIME = 1.5; // seconds
      const SAMPLE_TIME = 1.0; // seconds

      for (let P of pressures) {
        // set pressures
        sim.pressureFL = sim.pressureFR = sim.pressureRL = sim.pressureRR = P;

        // reset sim
        sim.resetBuffers();

        // ---- APPLY STEERING EXCITATION ----
        sim.steerInput = SWEEP_STEER; // constant small steer

        // let vehicle reach steady-state
        for (let t = 0; t < SETTLE_TIME; t += 0.01) {
          sim.step(0.01);
        }

        // ---- COLLECT SAMPLES ----
        const slipArr = [];
        const FyArr = [];
        const deltaArr = [];
        const yawArr = [];

        for (let t = 0; t < SAMPLE_TIME; t += 0.01) {
          sim.step(0.01);
          const N = sim.buf.slipFL.length;
          slipArr.push(sim.buf.slipFL[N - 1]);
          FyArr.push(sim.buf.FyFL[N - 1]);
          deltaArr.push(sim.buf.delta[N - 1]);
          yawArr.push(sim.buf.yaw[N - 1]);
        }

        // ---- ESTIMATE CORNERING STIFFNESS (Cα) ----
        const linearPoints = [];
        for (let i = 0; i < slipArr.length; i++) {
          if (Math.abs(slipArr[i]) < 3) {
            linearPoints.push({
              a: (slipArr[i] * Math.PI) / 180,
              f: FyArr[i],
            });
          }
        }

        let C_est = 0;
        if (linearPoints.length >= 4) {
          let sumX = 0,
            sumY = 0,
            sumXY = 0,
            sumXX = 0;
          linearPoints.forEach((p) => {
            sumX += p.a;
            sumY += p.f;
            sumXY += p.a * p.f;
            sumXX += p.a * p.a;
          });
          const n = linearPoints.length;
          C_est = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        }

        // ---- ESTIMATE YAW GAIN ----
        const avgYaw = yawArr.reduce((a, b) => a + b, 0) / yawArr.length;
        const avgDelta = deltaArr.reduce((a, b) => a + b, 0) / deltaArr.length;

        let yawGain = avgYaw / (avgDelta + 1e-6);

        // ---- UNDERSTEER GRADIENT Ku ----
        // Simplified bicycle model formula
        const Wf = 0.55; // assumed distribution front
        const Wr = 0.45; // rear
        let Ku = 0;
        if (C_est > 10) {
          Ku = Wf / C_est - Wr / C_est;
        }

        results.push({ P, C_est, yawGain, Ku });
      }

      // ---- UPDATE CHARTS ----
      chartPressureCalpha.data.labels = results.map((r) => r.P);
      chartPressureCalpha.data.datasets[0].data = results.map((r) => r.C_est);
      chartPressureCalpha.update();

      chartPressureYaw.data.labels = results.map((r) => r.P);
      chartPressureYaw.data.datasets[0].data = results.map((r) => r.yawGain);
      chartPressureYaw.update();

      chartUndersteer.data.labels = results.map((r) => r.P);
      chartUndersteer.data.datasets[0].data = results.map((r) => r.Ku);
      chartUndersteer.update();

      return results;
    },
  };
}
