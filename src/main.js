import { createScene } from "./scene.js";
import { VehicleSim } from "./sim.js";
import { createUI } from "./ui.js";
import { createPlots } from "./plots.js";
import { initExplanation } from "./explain.js";

const container = document.getElementById("canvas-container");

async function start() {
  //--------------------------------------------------
  // 1. Create scene
  //--------------------------------------------------
  const sceneApp = await createScene(container);

  //--------------------------------------------------
  // 2. Create simulator
  //--------------------------------------------------
  const sim = new VehicleSim({
    m: 1500,
    Iz: 2500,
    lf: 1.2,
    lr: 1.6,
    u: 20,
    P0: 32,
    Calpha0: 80000,
    sigma0: 0.2,
  });

  window.sim = sim; // expose globally

  sceneApp.onModelReady((nodes) => {
    sim.bindVisual(nodes);
  });

  //--------------------------------------------------
  // 3. Create UI & Plots
  //--------------------------------------------------
  const gui = createUI(sim);
  const plots = createPlots(sim);

  //--------------------------------------------------
  // 4. Explanation system (Magic Formula flow)
  //--------------------------------------------------
  const expl = initExplanation({ plots });
  window.expl = expl;

  //--------------------------------------------------
  // 5. Main loop
  //--------------------------------------------------
  let last = performance.now();
  function animate(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    sim.step(dt);
    sceneApp.update(dt);
    plots.update();

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  //--------------------------------------------------
  // 6. Pressure sweep controls
  //--------------------------------------------------
  document.getElementById("run-sweep").addEventListener("click", async () => {
    const btn = document.getElementById("run-sweep");
    btn.disabled = true;

    const sweepResults = await plots.runPressureSweep?.(); // optional chaining
    window.lastSweepResults = sweepResults;

    btn.disabled = false;
  });

  document.getElementById("export-csv").addEventListener("click", () => {
    const res = window.lastSweepResults;
    if (!res) return alert("Run pressure sweep first.");

    const csv = [
      "Pressure,Cornering_Stiffness,Yaw_Gain",
      ...res.map((r) => `${r.P},${r.C_est},${r.yawGain}`)
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "sweep_results.csv";
    a.click();

    URL.revokeObjectURL(url);
  });
}

start();
