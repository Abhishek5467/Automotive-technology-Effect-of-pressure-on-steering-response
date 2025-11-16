// plots.js
import Chart from 'chart.js/auto';

export function createPlots(sim){
  // get canvases
  const ctxDeltaYaw = document.getElementById('plot-delta-yaw').getContext('2d');
  const ctxAlphaFy = document.getElementById('plot-alpha-fy').getContext('2d');
  const ctxTime = document.getElementById('plot-time').getContext('2d');

  const ctxPressureCalpha = document.getElementById('plot-pressure-calpha').getContext('2d');
  const ctxPressureYaw = document.getElementById('plot-pressure-yawgain').getContext('2d');

  const ctxMzAlpha = document.getElementById('plot-mz-alpha').getContext('2d');
  const ctxAyDelta = document.getElementById('plot-ay-delta').getContext('2d');
  const ctxUndersteer = document.getElementById('plot-understeer').getContext('2d');

  // charts
  const chartDeltaYaw = new Chart(ctxDeltaYaw, {
    type: 'scatter',
    data: { datasets: [{ label: 'δ vs yaw', data: [] }] },
    options: {
      plugins:{legend:{display:false}},
      scales:{ x:{title:{display:true,text:'Steering angle δ (deg)'}}, y:{title:{display:true,text:'Yaw rate r (deg/s)'}} }
    }
  });

  const chartAlphaFy = new Chart(ctxAlphaFy, {
    type: 'scatter',
    data: { datasets: [{ label: 'α vs Fy', data: [] }] },
    options: {
      plugins:{legend:{display:false}},
      scales:{ x:{title:{display:true,text:'Slip angle α (deg)'}}, y:{title:{display:true,text:'Lateral force Fy (N)'}} }
    }
  });

  const chartTime = new Chart(ctxTime, {
    type: 'line',
    data: { labels: [], datasets:[
      {label:'steering δ (deg)', data:[], borderWidth:2, tension:0.2},
      {label:'yaw rate (deg/s)', data:[], borderWidth:2, tension:0.2},
      {label:'lateral accel (m/s²)', data:[], borderWidth:2, tension:0.2}
    ]},
    options:{scales:{x:{title:{display:true,text:'Time (s)'}}}}
  });

  // sweep charts (initially empty)
  let chartCalpha = new Chart(ctxPressureCalpha, {
    type:'line',
    data:{ labels:[], datasets:[{label:'cornering stiffness (N/rad)', data:[], borderWidth:2}] },
    options:{scales:{x:{title:{display:true,text:'Pressure (psi)'}}, y:{title:{display:true,text:'Cα (N/rad)'}}}}
  });
  let chartYawGain = new Chart(ctxPressureYaw, {
    type:'line',
    data:{ labels:[], datasets:[{label:'yaw gain (deg/s per deg)', data:[], borderWidth:2}] },
    options:{scales:{x:{title:{display:true,text:'Pressure (psi)'}}, y:{title:{display:true,text:'Yaw gain'}}}}
  });

  const chartMzAlpha = new Chart(ctxMzAlpha, {
    type:'scatter',
    data:{datasets:[{label:'Mz vs α', data:[]} ]},
    options:{scales:{x:{title:{display:true,text:'Slip angle α (deg)'}}, y:{title:{display:true,text:'Aligning torque Mz (Nm)'}}}}
  });

  const chartAyDelta = new Chart(ctxAyDelta, {
    type:'scatter',
    data:{datasets:[{label:'ay vs δ', data:[]} ]},
    options:{scales:{x:{title:{display:true,text:'Steering δ (deg)'}}, y:{title:{display:true,text:'Lateral accel (m/s²)'}}}}
  });

  const chartUnder = new Chart(ctxUndersteer, {
    type:'line',
    data:{ labels:[], datasets:[{label:'understeer coeff Ku', data:[], borderWidth:2}] },
    options:{scales:{x:{title:{display:true,text:'Pressure (psi)'}}, y:{title:{display:true,text:'Ku (positive = understeer)'}}}}
  });

  function update(){
    const buf = sim.buf;
    // delta vs yaw
    chartDeltaYaw.data.datasets[0].data = buf.delta.map((d,i)=>({x:d, y: buf.yaw[i]}));
    chartDeltaYaw.update('none');

    // alpha vs Fy
    chartAlphaFy.data.datasets[0].data = buf.slipFL.map((a,i)=>({x:a, y: buf.FyFL[i]}));
    chartAlphaFy.update('none');

    // time series
    chartTime.data.labels = buf.time.map(t=>t.toFixed(2));
    chartTime.data.datasets[0].data = buf.delta;
    chartTime.data.datasets[1].data = buf.yaw;
    chartTime.data.datasets[2].data = buf.ay;
    chartTime.update('none');

    // extra plots Mz vs alpha
    chartMzAlpha.data.datasets[0].data = buf.slipFL.map((a,i)=>({x:a, y: buf.MzFL[i]}));
    chartMzAlpha.update('none');

    // ay vs delta
    chartAyDelta.data.datasets[0].data = buf.delta.map((d,i)=>({x:d, y: buf.ay[i]}));
    chartAyDelta.update('none');
  }

  // sweep routine
  async function runPressureSweep(){
    const pressures = [18,22,25,28,32,36,40];
    const results = [];
    // save sim state
    const saved = {
      time: sim.time, r: sim.r, vy: sim.vy,
      pressure: sim.pressure,
      pressureFL: sim.pressureFL, pressureFR: sim.pressureFR, pressureRL: sim.pressureRL, pressureRR: sim.pressureRR
    };

    for(const P of pressures){
      sim.resetBuffers();
      // set per-wheel pressures to average P (we're sweeping uniform)
      sim.pressureFL = P; sim.pressureFR = P; sim.pressureRL = P; sim.pressureRR = P;

      // apply a step steering (10 deg) and integrate until steady or fixed time
      sim.steerInput = 10;
      sim.speed = 20; // m/s

      const T = 6.0; const dt = 0.005;
      const steps = Math.floor(T/dt);
      for(let i=0;i<steps;i++){
        sim.step(dt);
      }

      // estimate yaw gain = steady yaw rate / delta
      const lastIdx = sim.buf.time.length-1;
      const r_deg_s = sim.buf.yaw[lastIdx] || 0;
      const yawGain = r_deg_s / 10.0;

      // estimate cornering stiffness from initial small-angle region of alpha-Fy
      const sliceN = Math.min(40, sim.buf.slipFL.length);
      const x = sim.buf.slipFL.slice(0,sliceN).map(v => v * Math.PI/180);
      const y = sim.buf.FyFL.slice(0,sliceN);
      let C_est = 0;
      if(x.length>3){
        let num=0, den=0;
        for(let i=0;i<x.length;i++){ num += x[i]*y[i]; den += x[i]*x[i]; }
        C_est = den>1e-9? num/den : 0;
      }
      results.push({P, yawGain, C_est, simState: {r: sim.r, vy: sim.vy}});
    }

    // update sweep charts
    chartCalpha.data.labels = results.map(r=>r.P);
    chartCalpha.data.datasets[0].data = results.map(r=>r.C_est);
    chartCalpha.update();

    chartYawGain.data.labels = results.map(r=>r.P);
    chartYawGain.data.datasets[0].data = results.map(r=>r.yawGain);
    chartYawGain.update();

    // compute a simple understeer gradient Ku estimate:
    // Ku ≈ ( (lf*Caf - lr*Car) / (m * a) ) for small angles; approximate using yaw gain differences across pressures
    // Here we'll show a simple metric: (Car - Caf) normalized
    const Ku_list = results.map(r => {
      // rough proxy: Ku = (m*(1/r))/??? — keep simple and show trend: use inverse of C_est
      const val = r.C_est > 1e-6 ? 1.0 / r.C_est : 0;
      return val;
    });
    chartUnder.data.labels = results.map(r=>r.P);
    chartUnder.data.datasets[0].data = Ku_list;
    chartUnder.update();

    // restore sim state
    sim.resetBuffers();
    sim.time = saved.time; sim.r = saved.r; sim.vy = saved.vy;
    sim.pressure = saved.pressure;
    sim.pressureFL = saved.pressureFL; sim.pressureFR = saved.pressureFR; sim.pressureRL = saved.pressureRL; sim.pressureRR = saved.pressureRR;

    // attach results to window so front-end can export
    window.lastSweepResults = results;

    return results;
  }

  return { update, runPressureSweep };
}
