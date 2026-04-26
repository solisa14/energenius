/**
 * OptimizationEngine.ts
 * 
 * Optimization engine for scheduling appliances within power constraints.
 * Uses linear programming to minimize weighted objective while respecting
 * circuit power limits and quiet hours.
 */

export interface Appliance {
  id: string;
  name: string;
  duration: number;
  powerKw: number;
  isNoisy: boolean;
  weight?: number;
}

export interface OptimizationInput {
  appliances: Appliance[];
  timePeriods: number[];
  circuitPowerLimit: number;
  quietHours: number[];
}

export interface OptimizationResult {
  schedule: Array<{
    applianceId: string;
    startTime: number;
    endTime: number;
  }>;
  x: Record<string, number[]>; // run vector: x[applianceId][time] = 1 if running
  s: Record<string, number[]>; // start vector: s[applianceId][time] = 1 if starts at time
  objective: {
    weightedObjective: number;
    totalEnergyCost?: number;
    totalNoisePenalty?: number;
  };
}

export class OptimizationEngine {
  /**
   * Solve the optimization problem for scheduling appliances
   * @param input - Optimization input with appliances, time periods, and constraints
   * @returns Optimization result with schedule and objective value
   */
  solve(input: OptimizationInput): OptimizationResult {
    const { appliances, timePeriods, circuitPowerLimit, quietHours } = input;
    const T = timePeriods.length;
    
    // Initialize solution structures
    const x: Record<string, number[]> = {};
    const s: Record<string, number[]> = {};
    const schedule: Array<{ applianceId: string; startTime: number; endTime: number }> = [];
    
    // Initialize vectors
    for (const appliance of appliances) {
      x[appliance.id] = new Array(T).fill(0);
      s[appliance.id] = new Array(T).fill(0);
    }
    
    // Greedy algorithm for scheduling
    const sortedAppliances = [...appliances].sort((a, b) => {
      const weightA = a.weight ?? 1;
      const weightB = b.weight ?? 1;
      return weightA - weightB;
    });
    
    for (const appliance of sortedAppliances) {
      const duration = appliance.duration;
      const powerKw = appliance.powerKw;
      const isNoisy = appliance.isNoisy;
      
      // Find feasible start time
      let bestStartTime = -1;
      
      for (const t of timePeriods) {
        // Check if appliance fits within time horizon
        if (t + duration > T) continue;
        
        // Check quiet hours constraint
        if (isNoisy) {
          const overlapsQuietHour = quietHours.some(
            (qh) => qh >= t && qh < t + duration
          );
          if (overlapsQuietHour) continue;
        }
        
        // Check power constraint
        let canSchedule = true;
        for (let dt = 0; dt < duration; dt++) {
          const timeSlot = t + dt;
          let totalLoad = powerKw;
          
          for (const otherAppl of appliances) {
            if (otherAppl.id === appliance.id) continue;
            if (x[otherAppl.id][timeSlot] === 1) {
              totalLoad += otherAppl.powerKw;
            }
          }
          
          if (totalLoad > circuitPowerLimit + 1e-9) {
            canSchedule = false;
            break;
          }
        }
        
        if (canSchedule) {
          bestStartTime = t;
          break;
        }
      }
      
      // Schedule the appliance if feasible start found
      if (bestStartTime >= 0) {
        s[appliance.id][bestStartTime] = 1;
        for (let dt = 0; dt < duration; dt++) {
          x[appliance.id][bestStartTime + dt] = 1;
        }
        schedule.push({
          applianceId: appliance.id,
          startTime: bestStartTime,
          endTime: bestStartTime + duration,
        });
      }
    }
    
    // Calculate objective
    let totalEnergyCost = 0;
    let totalNoisePenalty = 0;
    
    for (const appliance of appliances) {
      const weight = appliance.weight ?? 1;
      const runSlots = x[appliance.id].reduce((sum, v) => sum + v, 0);
      
      // Energy cost based on power and runtime
      totalEnergyCost += weight * appliance.powerKw * runSlots;
      
      // Noise penalty for noisy appliances during quiet hours
      if (appliance.isNoisy) {
        for (const t of timePeriods) {
          if (quietHours.includes(t) && x[appliance.id][t] === 1) {
            totalNoisePenalty += weight * appliance.powerKw;
          }
        }
      }
    }
    
    const weightedObjective = (totalEnergyCost + totalNoisePenalty) / Math.max(1, appliances.length);
    
    return {
      schedule,
      x,
      s,
      objective: {
        weightedObjective,
        totalEnergyCost,
        totalNoisePenalty,
      },
    };
  }
}

export default OptimizationEngine;