import { createScene } from './scene.js';
import { VehicleSim } from './sim.js';
import { createUI } from './ui.js';
import { createPlots } from './plots.js';

const container = document.getElementById('canvas-container');

async function start(){
  const sceneApp = await createScene(container);

  const sim = new VehicleSim({
    m:1500, Iz:2500, lf:1.2, lr:1.6, u:20,
    P0:32, Calpha0:80000, sigma0:0.2
  });

  // expose sim globally for other modules (useful for label access)
  window.sim = sim;

  // when model is ready bind visuals
  sceneApp.onModelReady((nodes) => {
    sim.bindVisual(nodes);
  });

  const gui = createUI(sim);
  const plots = createPlots(sim);

  // main loop
  let last = performance.now();
  function animate(t){
    const dt = Math.min(0.05, (t-last)/1000);
    last = t;
    sim.step(dt);
    sceneApp.update(dt);
    plots.update();
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // sweep button and export
  document.getElementById('run-sweep').addEventListener('click', async () => {
    document.getElementById('run-sweep').disabled = true;
    const sweepResults = await plots.runPressureSweep();
    document.getElementById('run-sweep').disabled = false;
    // attach latest sweep results for CSV export
    window.lastSweepResults = sweepResults;
  });

  document.getElementById('export-csv').addEventListener('click', () => {
    const res = window.lastSweepResults;
    if(!res){ alert('Run pressure sweep first.'); return; }
    const csv = ['Pressure,cornering_stiffness,yaw_gain'].concat(res.map(r=>`${r.P},${r.C_est},${r.yawGain}`)).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sweep_results.csv'; a.click();
    URL.revokeObjectURL(url);
  });

}

start();
