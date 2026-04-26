# PuLP Optimization Engine

This folder now includes a **PuLP-based MILP solver** (not brute-force) for the appliance scheduling model.

## Files
- `pulp_optimization_engine.py`: main optimization engine class (`PuLPOptimizationEngine`)
- `mockScheduleData.json`: mock data for local validation
- `run_pulp_example.py`: simple script to run the solver with mock data

## Run
From this folder:

```bash
python run_pulp_example.py
```

> Requires `pulp` to be installed in your Python environment.