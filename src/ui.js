// ui.js
import GUI from 'lil-gui';

export function createUI(sim){
  const container = document.getElementById('controls');
  const gui = new GUI({container});

  const state = {
    globalPressure: sim.pressure,
    pressureFL: sim.pressureFL,
    pressureFR: sim.pressureFR,
    pressureRL: sim.pressureRL,
    pressureRR: sim.pressureRR,
    steering: 0,
    speed_kmh: sim.speed * 3.6,
    reset: ()=> sim.resetBuffers()
  };

  gui.add(state, 'globalPressure', 18, 44, 0.5).name('Tire pressure (global psi)').onChange(v => {
    sim.pressure = v;
    // also update per-wheel if they are still equal (optional: keep user-chosen separate)
    sim.pressureFL = v; sim.pressureFR = v; sim.pressureRL = v; sim.pressureRR = v;
    state.pressureFL = v; state.pressureFR = v; state.pressureRL = v; state.pressureRR = v;
  });

  const folderW = gui.addFolder('Per-wheel pressures (psi)');
  folderW.add(state, 'pressureFL', 14, 44, 0.1).name('Front Left').onChange(v => sim.pressureFL = v);
  folderW.add(state, 'pressureFR', 14, 44, 0.1).name('Front Right').onChange(v => sim.pressureFR = v);
  folderW.add(state, 'pressureRL', 14, 44, 0.1).name('Rear Left').onChange(v => sim.pressureRL = v);
  folderW.add(state, 'pressureRR', 14, 44, 0.1).name('Rear Right').onChange(v => sim.pressureRR = v);
  folderW.open();

  gui.add(state, 'steering', -35, 35, 0.1).name('Steering input (deg)').onChange(v => sim.steerInput = v);
  gui.add(state, 'speed_kmh', 0, 240, 1).name('Vehicle speed (km/h)').onChange(v => sim.speed = v/3.6);
  gui.add(state, 'reset').name('Reset sim buffers');

  return gui;
}
