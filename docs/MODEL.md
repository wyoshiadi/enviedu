# Single-stock model

For interval [t, t + Δt):

```text
I(t)       = inflow before policyAt; inflowAfter from the policyAt boundary
available  = S(t) + I(t) × Δt
Oactual(t) = min(capacity, available / Δt)
S(t + Δt)  = available − Oactual(t) × Δt
```

Parameters are finite and nonnegative. Actual outflow is limited by the stock and inflow available during the same interval. This is interval accounting, not a hydrodynamic or real carbon-cycle solver.

The inflow changes in intervals **starting** at policyAt. The t=6 row reports [5,6); t=7 uses the new inflow for [6,7). The graph marks the boundary t=6. The t=0 row is the initial condition, not an interval outflow measurement.

| Quantity | Waste | Urban water |
| --- | --- | --- |
| Stock | Unprocessed waste, t | Stored water, m³ |
| Initial inflow | 12 t/d | 120 m³/min |
| Inflow after change | 9 t/d | 90 m³/min |
| Outflow capacity | 8 t/d | 80 m³/min |
| Initial stock | 20 t | 200 m³ |
| Intervention time | 6 d | 6 min |
| Duration / step | 12 / 1 d | 12 / 1 min |
| Final stock | 50 t | 500 m³ |

Here t denotes metric tonnes and d denotes days. The numerical scale differs by 10× while the dynamic structure is identical. Under the initial conditions, decreasing inflow slows accumulation without reducing the stock. Further experiments allow balanced flows or declining stocks.

The engine rejects inconsistent units, invalid intervals, out-of-range values, invalid parameter increments, and intervention times not aligned with Δt. New configurations still require dimensional and substantive review.

Waste excludes degradation, multiple materials, storage limits, and other pathways. Flooding takes **runoff flow** as input rather than rainfall and excludes infiltration, topography, overflow, and flood-depth prediction. Carbon uses a single reservoir with fixed rates as specified in each question and does not represent the real atmosphere.

A compatible carbon configuration is tested using 100 + (8−6)×5 = 110. Carbon is not included among the practice simulators. The English release changes labels and units' notation while preserving all numerical calculations.

## Visual representation

The scene uses level = min(stock / referenceStock, 1), with a fixed reference from scenario configuration (100 t or 1,000 m³). The same stock always produces the same scene level across runs. This mapping is a visual convention, not an environmental submodel. Exact values remain available when illustrations reach full scale. The simulation stock remains unbounded by the visual reference. Waste items have no individually calibrated mass; water height has no physical depth interpretation. Playback uses the stored time series without recalculating or interpolating the model.

