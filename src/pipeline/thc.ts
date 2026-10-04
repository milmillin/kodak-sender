/**
 * Thermal-head comp — EXACT smear-adaptive pass (thc_sac), the only THC pass enabled in the
 * shipping config. Matches FUN_001c3450, run per channel, with the binary's built-in values.
 */
export function thcSAC(data: Uint8ClampedArray, w: number, h: number) {
  const shortAlpha = 2 / (1 + 1); // sacShortWindow = 1
  const longAlpha = 2 / (20 + 1); // sacLongWindow  = 20
  const inkDrop = 40, gainCharge = 0.3, releaseRate = 0.4;
  const applyTh = 192, gamma = 0.5, gainCorrect = 1.0, maxCorr = 20, lat = 0.25;
  for (let ch = 2; ch >= 0; ch--) { // channels processed 2,1,0 as in the binary
    const sEMA = new Float32Array(w), lEMA = new Float32Array(w), charge = new Float32Array(w);
    for (let y = 0; y < h; y++) { // top → bottom = print direction
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = (row + x) * 4 + ch;
        const ink = 255 - data[idx]; // work in the ink (inverted) domain
        sEMA[x] = shortAlpha * ink + (1 - shortAlpha) * sEMA[x];
        lEMA[x] = longAlpha * ink + (1 - longAlpha) * lEMA[x];
        if (lEMA[x] - sEMA[x] > inkDrop) { // ink just dropped → charge up residual heat
          const f = lEMA[x] * gainCharge;
          if (charge[x] < f) charge[x] = f;
        }
        charge[x] *= releaseRate;
        let corr = 0;
        if (ink < applyTh) { // correct only in lighter areas
          const ratio = ink / applyTh;
          let t = 1 - Math.pow(ratio, gamma); if (t < 0) t = 0;
          corr = charge[x] * gainCorrect * t;
          if (corr > maxCorr) corr = maxCorr;
        }
        let ni = (ink - corr) | 0; ni = ni < 0 ? 0 : ni > 255 ? 255 : ni;
        data[idx] = 255 - ni;
      }
      if (lat > 0) { // lateral smooth of the charge line
        let prev = charge[0];
        for (let x = 1; x < w - 1; x++) {
          const cur = prev; prev = charge[x];
          charge[x] = lat * cur + (1 - 2 * lat) * charge[x] + lat * charge[x + 1];
        }
      }
    }
  }
}
