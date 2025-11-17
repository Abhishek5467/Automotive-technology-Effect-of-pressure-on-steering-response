// src/sim.js — corrected, stable VehicleSim implementation

export class VehicleSim {
  constructor(params) {
    this.m = params.m;
    this.Iz = params.Iz;
    this.lf = params.lf;
    this.lr = params.lr;

    this.speed = params.u || 0.01; // m/s, forward speed (never zero)

    this.P0 = params.P0;
    this.Calpha0 = params.Calpha0;
    this.sigma0 = params.sigma0;

    // pressure (global + per-wheel)
    this.pressure = this.P0;
    this.pressureFL = this.P0;
    this.pressureFR = this.P0;
    this.pressureRL = this.P0;
    this.pressureRR = this.P0;

    // dynamic state
    this.r = 0; // yaw rate (rad/s)
    this.vy = 0; // lateral velocity (m/s)
    this.time = 0; // simulation time (s)

    // wheel animation state (bounded)
    this._wheelSpin = 0; // rad

    // input
    this.steerInput = 0; // degrees

    // visual nodes (set by bindVisual)
    this.visual = null;
    this.frontSteerAngle = 0;

    this.resetBuffers();
  }

  resetBuffers() {
    this.buf = {
      time: [],
      delta: [],
      yaw: [],
      slipFL: [],
      FyFL: [],
      MzFL: [],
      ay: [],
    };
    this.time = 0;
    this.vy = 0;
    this.r = 0;
  }

  bindVisual(nodes) {
    this.visual = nodes;
    if (nodes.frontLeftWheel) nodes.frontLeftWheel.userData.isWheel = true;
    if (nodes.frontRightWheel) nodes.frontRightWheel.userData.isWheel = true;
    if (nodes.rearLeftWheel) nodes.rearLeftWheel.userData.isWheel = true;
    if (nodes.rearRightWheel) nodes.rearRightWheel.userData.isWheel = true;
  }

  // Cornering stiffness vs pressure (user-defined formula)
  CalphaFromP(P) {
    // guard: don't divide by zero
    const safeP = Math.max(0.1, P);
    return this.Calpha0 * Math.pow(safeP / this.P0, 0.8);
  }

  // single integration step (dt in seconds)
  step(dt) {
    if (!(dt > 0)) return;

    this.time += dt;

    // steering input in radians
    const delta_deg = this.steerInput || 0;
    const delta = (delta_deg * Math.PI) / 180;

    // forward speed safe
    const u = Math.max(0.01, this.speed);

    // front / rear average pressures (per-wheel supported)
    const Pf = 0.5 * (this.pressureFL + this.pressureFR);
    const Pr = 0.5 * (this.pressureRL + this.pressureRR);

    const Caf = this.CalphaFromP(Pf);
    const Car = this.CalphaFromP(Pr);

    // ----- SLIP ANGLES (small-angle bicycle approx) -----
    // alpha_f = delta - (vy + lf * r)/u
    // alpha_r = - (vy - lr * r)/u
    let alpha_f = delta - (this.vy + this.lf * this.r) / u;
    let alpha_r = -(this.vy - this.lr * this.r) / u;

    // clamp slip (rad) to reasonable physical bounds to avoid numeric blowups
    const maxSlip = (20 * Math.PI) / 180;
    alpha_f = Math.max(-maxSlip, Math.min(maxSlip, alpha_f));
    alpha_r = Math.max(-maxSlip, Math.min(maxSlip, alpha_r));

    // ----- LATERAL FORCES (linear approx near origin; PF/FZ effects could be added) -----
    const Fy_f_raw = -Caf * alpha_f;
    const Fy_r_raw = -Car * alpha_r;

    // clamp forces to physical limits
    const FyMax = 1e5;
    const Fy_f = Math.max(-FyMax, Math.min(FyMax, Fy_f_raw));
    const Fy_r = Math.max(-FyMax, Math.min(FyMax, Fy_r_raw));

    // ----- DAMPING TERMS (stabilize dynamics) -----
    const Cv = 3000; // lateral damping (N·s/m) - tuneable
    const Cr = 2500; // yaw damping (N·m·s/rad) - tuneable

    // ----- DYNAMICS (with damping) -----
    // m( vy_dot + u r ) = Fy_f + Fy_r - Cv*vy  => vy_dot = (Fy_f + Fy_r - Cv*vy)/m - u*r
    const vy_dot = (Fy_f + Fy_r - Cv * this.vy) / this.m - u * this.r;

    // Iz * r_dot = lf*Fy_f - lr*Fy_r - Cr*r
    const r_dot = (this.lf * Fy_f - this.lr * Fy_r - Cr * this.r) / this.Iz;

    // integrate (forward Euler)
    this.vy += vy_dot * dt;
    this.r += r_dot * dt;

    // clamp states to safe ranges
    const vyMax = 50; // m/s
    const rMax = 50; // rad/s (~2860 deg/s — still generous, will be clamped further by physical forces)
    this.vy = Math.max(-vyMax, Math.min(vyMax, this.vy));
    this.r = Math.max(-rMax, Math.min(rMax, this.r));

    // guard NaN/Inf
    if (!isFinite(this.vy) || !isFinite(this.r)) {
      console.warn("Numerical instability detected — resetting vy and r to zero.");
      this.vy = 0;
      this.r = 0;
    }

    // lateral acceleration at vehicle CG (correct formula)
    const ay = vy_dot + u * this.r;

    // approximate aligning torque (simple proportional relationship)
    const Mz_f = 0.12 * Fy_f;

    // ----- Save to buffers (for plotting) -----
    // Trim before push if we are at the limit
    const maxN = 2000;
    if (this.buf.time.length >= maxN) {
      for (const k in this.buf) this.buf[k].shift();
    }

    this.buf.time.push(this.time);
    this.buf.delta.push(delta_deg);
    this.buf.yaw.push((this.r * 180) / Math.PI); // store yaw in deg/s
    this.buf.slipFL.push((alpha_f * 180) / Math.PI); // deg
    this.buf.FyFL.push(Fy_f);
    this.buf.MzFL.push(Mz_f);
    this.buf.ay.push(ay);

    // ----- Update visuals (pass dt so wheel spin integration uses it) -----
    this.updateVisual(delta, alpha_f, Fy_f, dt);
  }

  updateVisual(steerRad, slipFL, FyFL, dt) {
    if (!this.visual) return;

    // simple smoothing for steer visual
    this.frontSteerAngle += (steerRad - this.frontSteerAngle) * 0.2;

    if (this.visual.steerPivot) {
      this.visual.steerPivot.rotation.y = this.frontSteerAngle;
    }

    // wheel rolling - integrate spin incrementally and bound it to [0,2π) to avoid huge numbers
    const wheelR = 0.33; // m approximate
    const omega = this.speed / Math.max(wheelR, 0.05); // rad/s approx
    this._wheelSpin = (this._wheelSpin + omega * dt) % (Math.PI * 2);

    const wheels = [
      this.visual.frontLeftWheel,
      this.visual.frontRightWheel,
      this.visual.rearLeftWheel,
      this.visual.rearRightWheel,
    ];

    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      if (!w) continue;

      // roll (local X axis assumed)
      w.rotation.x = this._wheelSpin;

      // apply steering rotation for front wheels (prefer parent if model is rigged)
      if (i === 0 || i === 1) {
        if (w.parent) w.parent.rotation.y = this.frontSteerAngle;
        else w.rotation.y = this.frontSteerAngle;
      }

      // visual tire deformation based on per-wheel pressure
      let p = this.pressure;
      if (i === 0) p = this.pressureFL;
      if (i === 1) p = this.pressureFR;
      if (i === 2) p = this.pressureRL;
      if (i === 3) p = this.pressureRR;

      const deform = Math.max(0.8, Math.min(1.05, 1 - (32 - p) * 0.004));
      w.scale.set(deform, deform, deform);
    }
  }
}
