
package com.routewise.routewise_backend.service;

import com.routewise.routewise_backend.model.DeliveryPoint;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class HamiltonianCycleSolver {

    private static final int MAX_POINTS = 20;

    public List<DeliveryPoint> solve(
            List<DeliveryPoint> points,
            DistanceMatrix distanceMatrix) {

        if (points == null || points.size() < 2) {
            throw new IllegalArgumentException(
                    "At least two points are required, including the depot.");
        }

        int n = points.size();

        if (distanceMatrix.size() != n) {
            throw new IllegalArgumentException(
                    "Points and distance matrix sizes must match.");
        }

        if (n > MAX_POINTS) {
            throw new IllegalArgumentException(
                    "Exact Hamiltonian cycle optimization supports at most "
                            + MAX_POINTS
                            + " points. Use a heuristic for larger routes.");
        }

        int totalMasks = 1 << n;
        double[][] dp = new double[totalMasks][n];
        int[][] parent = new int[totalMasks][n];

        for (int mask = 0; mask < totalMasks; mask++) {
            for (int last = 0; last < n; last++) {
                dp[mask][last] = Double.POSITIVE_INFINITY;
                parent[mask][last] = -1;
            }
        }

        // Start at the depot, which is points.get(0).
        dp[1][0] = 0.0;

        for (int mask = 1; mask < totalMasks; mask++) {

            // Only consider states that include the depot.
            if ((mask & 1) == 0) {
                continue;
            }

            for (int last = 0; last < n; last++) {

                if ((mask & (1 << last)) == 0
                        || !Double.isFinite(dp[mask][last])) {
                    continue;
                }

                for (int next = 1; next < n; next++) {

                    if ((mask & (1 << next)) != 0) {
                        continue;
                    }

                    int nextMask = mask | (1 << next);

                    double candidateDistance = dp[mask][last]
                            + distanceMatrix.getDistance(last, next);

                    if (candidateDistance < dp[nextMask][next]) {
                        dp[nextMask][next] = candidateDistance;
                        parent[nextMask][next] = last;
                    }
                }
            }
        }

        int fullMask = totalMasks - 1;
        int lastPoint = -1;
        double minimumDistance = Double.POSITIVE_INFINITY;

        // Complete the cycle by returning to the depot.
        for (int last = 1; last < n; last++) {

            double candidateDistance = dp[fullMask][last]
                    + distanceMatrix.getDistance(last, 0);

            if (candidateDistance < minimumDistance) {
                minimumDistance = candidateDistance;
                lastPoint = last;
            }
        }

        if (lastPoint == -1) {
            throw new IllegalStateException(
                    "Could not construct a Hamiltonian cycle.");
        }

        // Reconstruct the optimal route.
        List<Integer> reversedRoute = new ArrayList<>();

        int mask = fullMask;
        int current = lastPoint;

        while (current != 0) {
            reversedRoute.add(current);

            int previous = parent[mask][current];
            mask ^= (1 << current);
            current = previous;
        }

        reversedRoute.add(0);
        Collections.reverse(reversedRoute);

        List<DeliveryPoint> route = new ArrayList<>();

        for (int index : reversedRoute) {
            route.add(points.get(index));
        }

        // Return to the depot to close the Hamiltonian cycle.
        route.add(points.get(0));

        return route;
    }
}
