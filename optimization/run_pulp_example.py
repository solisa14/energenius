from __future__ import annotations

import json
from pathlib import Path

from pulp_optimization_engine import MultiSolutionEngine


def main() -> None:
    base_dir = Path(__file__).parent
    data_path = base_dir / "mockScheduleData.json"
    output_path = base_dir / "sample_solution.json"

    data = json.loads(data_path.read_text(encoding="utf-8"))

    engine = MultiSolutionEngine()
    result = engine.solve(data, top_k=3)

    output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Saved solver output to: {output_path}\n")

    for sol in result["solutions"]:
        print(f"=== Rank {sol['rank']} (weighted obj: {sol['objective']['weightedObjective']:.4f}) ===")
        for entry in sol["schedule"]:
            print(f"  {entry['applianceId']:25s} starts at slot {entry['startTime']:2d}  runs {entry['runPeriods']}")
        print()


if __name__ == "__main__":
    main()