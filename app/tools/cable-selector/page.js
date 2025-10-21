"use client"

import React, { useState, useEffect } from 'react';

const CableSizeSelector = () => {
  // Input states
  const [loadCurrent, setLoadCurrent] = useState('');
  const [routeLength, setRouteLength] = useState('');
  const [supplyVoltage, setSupplyVoltage] = useState('230');
  const [percentageVoltDrop, setPercentageVoltDrop] = useState('5');
  const [valueVoltDrop, setValueVoltDrop] = useState('');
  const [phase, setPhase] = useState('single');
  const [cores, setCores] = useState('single');
  const [installCondition, setInstallCondition] = useState('unenclosed-air');
  const [conductor, setConductor] = useState('copper');
  const [insulation, setInsulation] = useState('V75');
  
  // Results state
  const [results, setResults] = useState(null);

  // Auto-calculate value volt drop when percentage changes
  useEffect(() => {
    if (supplyVoltage && percentageVoltDrop) {
      const voltage = parseFloat(supplyVoltage);
      const percentage = parseFloat(percentageVoltDrop);
      if (!isNaN(voltage) && !isNaN(percentage)) {
        setValueVoltDrop(((voltage * percentage) / 100).toFixed(2));
      }
    }
  }, [supplyVoltage, percentageVoltDrop]);

  // Auto-calculate percentage when value changes
  const handleValueVoltDropChange = (value) => {
    setValueVoltDrop(value);
    if (supplyVoltage && value) {
      const voltage = parseFloat(supplyVoltage);
      const voltDrop = parseFloat(value);
      if (!isNaN(voltage) && !isNaN(voltDrop) && voltage > 0) {
        setPercentageVoltDrop(((voltDrop / voltage) * 100).toFixed(2));
      }
    }
  };

  // Cable resistance data (mΩ/m at 75°C for copper, from AS/NZS 3008 Table 34)
  const resistanceData = {
    copper: {
      '1': 25.8, '1.5': 16.5, '2.5': 9.01, '4': 5.61, '6': 3.75, '10': 2.23,
      '16': 1.40, '25': 0.884, '35': 0.638, '50': 0.471, '70': 0.327,
      '95': 0.236, '120': 0.188, '150': 0.153, '185': 0.123, '240': 0.0948,
      '300': 0.0770, '400': 0.0620
    },
    aluminum: {
      '16': 2.33, '25': 1.47, '35': 1.06, '50': 0.783, '70': 0.542,
      '95': 0.392, '120': 0.310, '150': 0.253, '185': 0.202, '240': 0.155,
      '300': 0.125, '400': 0.0981
    }
  };

  // Cable reactance data (mΩ/m at 50Hz, from AS/NZS 3008 Table 30)
  const reactanceData = {
    '1': 0.139, '1.5': 0.129, '2.5': 0.118, '4': 0.110, '6': 0.104, '10': 0.0967,
    '16': 0.0913, '25': 0.0895, '35': 0.0863, '50': 0.0829, '70': 0.0798,
    '95': 0.0790, '120': 0.0765, '150': 0.0765, '185': 0.0762, '240': 0.0751,
    '300': 0.0746, '400': 0.0740
  };

  // Current carrying capacity data (simplified, from AS/NZS 3008 Tables 4-15)
  const currentCapacity = {
    copper: {
      unenclosed: {
        single: { '1.5': 21, '2.5': 29, '4': 38, '6': 49, '10': 67, '16': 88, '25': 110, '35': 137, '50': 171, '70': 231, '95': 304, '120': 348, '150': 395, '185': 438, '240': 528, '300': 609, '400': 734 },
        three: { '1.5': 17, '2.5': 24, '4': 32, '6': 41, '10': 57, '16': 75, '25': 100, '35': 125, '50': 157, '70': 198, '95': 244, '120': 284, '150': 328, '185': 376, '240': 451, '300': 519, '400': 621 }
      },
      enclosed: {
        single: { '1.5': 17, '2.5': 23, '4': 31, '6': 40, '10': 54, '16': 68, '25': 87, '35': 109, '50': 134, '70': 169, '95': 198, '120': 236, '150': 267, '185': 305, '240': 368, '300': 415, '400': 500 },
        three: { '1.5': 14, '2.5': 19, '4': 24, '6': 32, '10': 43, '16': 57, '25': 73, '35': 92, '50': 112, '70': 142, '95': 172, '120': 199, '150': 229, '185': 257, '240': 309, '300': 346, '400': 415 }
      }
    }
  };

  const calculateCableSize = () => {
    const current = parseFloat(loadCurrent);
    const length = parseFloat(routeLength);
    const voltage = parseFloat(supplyVoltage);
    const maxVdPercent = parseFloat(percentageVoltDrop);

    if (!current || !length || !voltage || !maxVdPercent) {
      alert('Please fill in all required fields');
      return;
    }

    // Calculate maximum permissible voltage drop
    const maxVoltDrop = parseFloat(valueVoltDrop) || (voltage * maxVdPercent) / 100;

    // Get available cable sizes
    const availableSizes = Object.keys(resistanceData[conductor]).map(s => parseFloat(s)).sort((a, b) => a - b);
    
    let selectedSize = null;
    let calculationDetails = null;

    // Find smallest cable that meets voltage drop requirement
    for (const size of availableSizes) {
      const sizeStr = size.toString();
      const resistance = resistanceData[conductor][sizeStr];
      const reactance = reactanceData[sizeStr] || 0.08;

      if (!resistance) continue;

      // Calculate impedance
      const impedance = Math.sqrt(Math.pow(resistance, 2) + Math.pow(reactance, 2));

      // Calculate voltage drop based on phase configuration
      let voltDrop;
      if (phase === 'single') {
        voltDrop = (2 * current * length * impedance) / 1000;
      } else {
        voltDrop = (Math.sqrt(3) * current * length * impedance) / 1000;
      }

      const voltDropPercent = (voltDrop / voltage) * 100;

      // Check current carrying capacity
      const installType = installCondition.includes('enclosed') ? 'enclosed' : 'unenclosed';
      const coreType = cores === 'single' ? 'single' : 'three';
      const capacity = currentCapacity[conductor]?.[installType]?.[coreType]?.[sizeStr] || 999;

      // Check if cable meets both voltage drop and current capacity requirements
      if (voltDrop <= maxVoltDrop && current <= capacity) {
        selectedSize = size;
        calculationDetails = {
          size: size,
          voltDrop: voltDrop.toFixed(3),
          voltDropPercent: voltDropPercent.toFixed(2),
          maxVoltDrop: maxVoltDrop.toFixed(3),
          maxVoltDropPercent: maxVdPercent.toFixed(2),
          currentCapacity: capacity,
          resistance: resistance.toFixed(4),
          reactance: reactance.toFixed(4),
          impedance: impedance.toFixed(4),
          acceptable: voltDrop <= maxVoltDrop && current <= capacity,
          phaseFormula: phase === 'single' 
            ? 'Vd = 2 × I × L × Z / 1000'
            : 'Vd = √3 × I × L × Z / 1000',
          maxLength: ((voltage * maxVdPercent / 100 * 1000) / (current * impedance * (phase === 'single' ? 2 : Math.sqrt(3)))).toFixed(1)
        };
        break;
      }
    }

    setResults(calculationDetails);
  };

  const resetForm = () => {
    setLoadCurrent('');
    setRouteLength('');
    setPercentageVoltDrop('5');
    setValueVoltDrop('');
    setResults(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 touch-manipulation select-none">
      <style jsx global>{`
        * {
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
        }
        input, select {
          user-select: text;
          -webkit-user-select: text;
        }
        body {
          overscroll-behavior: none;
          touch-action: pan-y;
        }
      `}</style>
      
      <div className="max-w-4xl mx-auto">
        <div className="p-4 rounded-xl bg-neutral-900/80 border-2 border-white/10 mt-4">
          <div className="mb-4">
            <h2 className="text-lg font-bold">Cable Size Selector</h2>
            <p className="text-xs text-white/60">AS/NZS 3000 & 3008 Compliant</p>
          </div>
          
          <div className="space-y-2">
            {/* Load Current */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Load Current (A)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={loadCurrent}
                onChange={(e) => setLoadCurrent(e.target.value)}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.target.select()}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 text-lg font-bold text-center select-text touch-manipulation"
                placeholder="20"
              />
            </div>

            {/* Route Length */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Route Length (m)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={routeLength}
                onChange={(e) => setRouteLength(e.target.value)}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.target.select()}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 text-lg font-bold text-center select-text touch-manipulation"
                placeholder="25"
              />
            </div>

            {/* Supply Voltage */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Supply Voltage (V)</label>
              <select
                value={supplyVoltage}
                onChange={(e) => setSupplyVoltage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 font-bold text-base text-center select-text touch-manipulation"
              >
                <option value="230">230V</option>
                <option value="400">400V</option>
              </select>
            </div>

            {/* Percentage Volt Drop */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Percentage Volt Drop (%)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={percentageVoltDrop}
                onChange={(e) => setPercentageVoltDrop(e.target.value)}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.target.select()}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 text-lg font-bold text-center select-text touch-manipulation"
                placeholder="5"
              />
            </div>

            {/* Value Volt Drop */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Value Volt Drop (V)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={valueVoltDrop}
                onChange={(e) => handleValueVoltDropChange(e.target.value)}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.target.select()}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 text-lg font-bold text-center select-text touch-manipulation"
                placeholder="11.5"
              />
            </div>

            {/* Supply Phase */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Supply Phase</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPhase('single')}
                  className={`py-2 px-3 rounded-lg border-2 transition font-semibold text-sm touch-manipulation ${
                    phase === 'single' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Single
                  <div className="text-xs opacity-70">230V</div>
                </button>
                <button
                  onClick={() => setPhase('three')}
                  className={`py-2 px-3 rounded-lg border-2 transition font-semibold text-sm touch-manipulation ${
                    phase === 'three' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Three Phase
                  <div className="text-xs opacity-70">400V</div>
                </button>
              </div>
            </div>

            {/* Cores */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Cores</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCores('single')}
                  className={`py-2 px-3 rounded-lg border-2 transition font-semibold text-sm touch-manipulation ${
                    cores === 'single' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Single Core
                </button>
                <button
                  onClick={() => setCores('multi')}
                  className={`py-2 px-3 rounded-lg border-2 transition font-semibold text-sm touch-manipulation ${
                    cores === 'multi' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Multi-Core
                </button>
              </div>
            </div>

            {/* Install Method */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Install Method</label>
              <select
                value={installCondition}
                onChange={(e) => setInstallCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 font-medium text-xs select-text touch-manipulation"
              >
                <option value="unenclosed-air">Unenclosed in Air</option>
                <option value="enclosed-conduit">Enclosed in Conduit</option>
                <option value="clipped-surface">Clipped to Surface</option>
                <option value="buried-direct">Buried Direct</option>
              </select>
            </div>

            {/* Calculate Button */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={calculateCableSize}
                className="flex-1 py-3 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-neutral-950 font-bold text-base transition touch-manipulation active:scale-98"
              >
                Calculate
              </button>
              <button
                onClick={resetForm}
                className="px-5 py-3 rounded-lg bg-white/5 hover:bg-white/10 border-2 border-white/20 font-medium text-xs transition touch-manipulation active:scale-98"
              >
                Reset
              </button>
            </div>
          </div>

          {results && (
            <div className="mt-8 pt-8 border-t border-white/10 scroll-mt-4">
              {results.error ? (
                <div className="p-4 rounded-xl bg-red-500/10 border-2 border-red-500/30">
                  <p className="text-red-400 font-medium">{results.error}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`p-6 rounded-xl border-2 ${
                    results.acceptable 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    <div className="text-sm text-white/60 mb-2">Recommended Cable Size</div>
                    <div className="text-4xl sm:text-5xl font-bold mb-3">
                      {results.size} mm²
                    </div>
                    <div className="text-sm text-white/60 mb-1">Voltage Drop</div>
                    <div className="text-2xl sm:text-3xl font-bold mb-3">
                      {results.voltDrop}V ({results.voltDropPercent}%)
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      {results.acceptable ? (
                        <>
                          <span className="text-green-400 text-2xl">✓</span>
                          <span className="text-green-400 font-medium text-base sm:text-lg">
                            Complies with AS/NZS 3000 (≤{results.maxVoltDropPercent}%)
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-red-400 text-2xl">✗</span>
                          <span className="text-red-400 font-medium text-base sm:text-lg">
                            Exceeds {results.maxVoltDropPercent}% limit - Use larger cable or shorter run
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">Current Capacity</div>
                      <div className="text-xl sm:text-2xl font-bold">{results.currentCapacity}A</div>
                      <div className="text-xs text-white/50 mt-1">
                        Load: {loadCurrent}A ({((loadCurrent/results.currentCapacity)*100).toFixed(1)}%)
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">Max Length @ {results.maxVoltDropPercent}%</div>
                      <div className="text-xl sm:text-2xl font-bold">{results.maxLength}m</div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">Resistance (R)</div>
                      <div className="text-lg sm:text-xl font-bold">{results.resistance} mΩ/m</div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">Impedance (Z)</div>
                      <div className="text-lg sm:text-xl font-bold">{results.impedance} mΩ/m</div>
                    </div>
                    <div className="col-span-2 p-4 rounded-xl bg-yellow-400/10 border border-yellow-400/30">
                      <div className="text-xs text-yellow-400 mb-1">Calculation Method</div>
                      <div className="text-base sm:text-lg font-bold text-yellow-400">{results.phaseFormula}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-yellow-400/10 border border-yellow-400/30">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">📖</span>
                        <div>
                          <div className="font-medium text-yellow-400 text-sm sm:text-base">
                            AS/NZS 3000:2018 Clause 3.6.2.2
                          </div>
                          <div className="text-sm text-white/70 mt-1">
                            Maximum voltage drop: {results.maxVoltDropPercent}% ({results.maxVoltDrop}V)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CableSizeSelector;