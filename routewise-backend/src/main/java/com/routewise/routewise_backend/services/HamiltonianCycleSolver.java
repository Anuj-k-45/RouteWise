
package com.routewise.routewise_backend.service;

import com.routewise.routewise_backend.model.DeliveryPoint;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;

public class HamiltonianCycleSolver {

    private static final int MAX_EXACT_POINTS = 20;

    public List<DeliveryPoint> solve(
            List<DeliveryPoint> points,
            DistanceMatrix distanceMatrix) {

        if (points == null || points.size() < 2) {
            throw new IllegalArgumentException(
                    "At least two points are required, including the depot.");
        }

        if (distanceMatrix == null
                || distanceMatrix.size() != points.size()) {
            throw new IllegalArgumentException(
                    "Points and distance matrix sizes must match.");
        }

        int n = points.size();

        if (n <= MAX_EXACT_POINTS) {
            return solveExactly(points, distanceMatrix);
        }

        return solveApproximately(points, distanceMatrix);
    }

    /*
     * Exact Held-Karp dynamic programming.
     * points.get(0) is the depot.
     */
    private List<DeliveryPoint> solveExactly(
            List<DeliveryPoint> points,
            DistanceMatrix distanceMatrix) {

        System.out.println("-------------------------------------------------------");
        System.out.println("Using Held-Karp Hamiltonian Cycle Solver");
        System.out.println("-------------------------------------------------------");

        int n = points.size();
        int totalMasks = 1 << n;

        double[][] dp = new double[totalMasks][n];
        int[][] parent = new int[totalMasks][n];

        for (int mask = 0; mask < totalMasks; mask++) {
            for (int last = 0; last < n; last++) {
                dp[mask][last] = Double.POSITIVE_INFINITY;
                parent[mask][last] = -1;
            }
        }

        dp[1][0] = 0.0;

        for (int mask = 1; mask < totalMasks; mask++) {

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

                    double edgeDistance = distanceMatrix.getDistance(last, next);

                    validateDistance(edgeDistance);

                    int nextMask = mask | (1 << next);

                    double candidate = dp[mask][last] + edgeDistance;

                    if (candidate < dp[nextMask][next]) {
                        dp[nextMask][next] = candidate;
                        parent[nextMask][next] = last;
                    }
                }
            }
        }

        int fullMask = totalMasks - 1;
        int lastPoint = -1;
        double minimumDistance = Double.POSITIVE_INFINITY;

        // Close the cycle by returning to the depot.
        for (int last = 1; last < n; last++) {

            if (!Double.isFinite(dp[fullMask][last])) {
                continue;
            }

            double returnDistance = distanceMatrix.getDistance(last, 0);

            validateDistance(returnDistance);

            double candidate = dp[fullMask][last] + returnDistance;

            if (candidate < minimumDistance) {
                minimumDistance = candidate;
                lastPoint = last;
            }
        }

        if (lastPoint == -1) {
            throw new IllegalStateException(
                    "Could not construct a Hamiltonian cycle.");
        }

        List<Integer> reversedRoute = new ArrayList<>();

        int mask = fullMask;
        int current = lastPoint;

        while (current != 0) {
            reversedRoute.add(current);

            int previous = parent[mask][current];

            if (previous == -1) {
                throw new IllegalStateException(
                        "Could not reconstruct the optimal route.");
            }

            mask ^= (1 << current);
            current = previous;
        }

        reversedRoute.add(0);
        Collections.reverse(reversedRoute);

        List<DeliveryPoint> route = new ArrayList<>();

        for (int index : reversedRoute) {
            route.add(points.get(index));
        }

        route.add(points.get(0));

        return route;
    }

    /*
     * Approximate TSP solution:
     * 1. Build an MST using Prim's algorithm.
     * 2. Generate an Euler tour of the doubled MST.
     * 3. Shortcut repeated vertices.
     * 4. Return to the depot.
     */
    private List<DeliveryPoint> solveApproximately(
            List<DeliveryPoint> points,
            DistanceMatrix distanceMatrix) {

        System.out.println("-------------------------------------------------------");
        System.out.println("Using Approximate TSP Solver (MST + Euler Tour)");
        System.out.println("-------------------------------------------------------");

        int n = points.size();

        List<List<Integer>> tree = buildMst(distanceMatrix, n);

        List<Integer> eulerTour = buildEulerTour(tree);

        boolean[] visited = new boolean[n];
        List<DeliveryPoint> route = new ArrayList<>(n + 1);

        // Shortcut repeated vertices, preserving Euler-tour order.
        for (int node : eulerTour) {
            if (!visited[node]) {
                visited[node] = true;
                route.add(points.get(node));
            }
        }

        // Ensure the cycle returns to the depot.
        route.add(points.get(0));

        return route;
    }

    /*
     * Prim's algorithm.
     * The distance matrix is assumed to represent symmetric distances.
     */
    private List<List<Integer>> buildMst(
            DistanceMatrix distanceMatrix,
            int n) {

        double[] minDistance = new double[n];
        int[] parent = new int[n];
        boolean[] inMst = new boolean[n];

        for (int i = 0; i < n; i++) {
            minDistance[i] = Double.POSITIVE_INFINITY;
            parent[i] = -1;
        }

        // Start the tree at the depot.
        minDistance[0] = 0.0;

        for (int count = 0; count < n; count++) {

            int current = -1;
            double smallestDistance = Double.POSITIVE_INFINITY;

            for (int node = 0; node < n; node++) {
                if (!inMst[node]
                        && minDistance[node] < smallestDistance) {
                    smallestDistance = minDistance[node];
                    current = node;
                }
            }

            if (current == -1) {
                throw new IllegalStateException(
                        "Could not build an MST. "
                                + "Check the distance matrix.");
            }

            inMst[current] = true;

            for (int next = 0; next < n; next++) {

                if (inMst[next] || next == current) {
                    continue;
                }

                double distance = distanceMatrix.getDistance(current, next);

                validateDistance(distance);

                if (distance < minDistance[next]) {
                    minDistance[next] = distance;
                    parent[next] = current;
                }
            }
        }

        List<List<Integer>> tree = new ArrayList<>();

        for (int i = 0; i < n; i++) {
            tree.add(new ArrayList<>());
        }

        for (int node = 1; node < n; node++) {
            int p = parent[node];

            if (p == -1) {
                throw new IllegalStateException(
                        "MST contains an unconnected node.");
            }

            tree.get(p).add(node);
            tree.get(node).add(p);
        }

        return tree;
    }

    /*
     * Produces an Euler circuit of the MST with each edge
     * traversed once in each direction.
     *
     * The MST is a tree, so DFS with backtracking constructs
     * this walk without needing a general graph Euler algorithm.
     */
    private List<Integer> buildEulerTour(
            List<List<Integer>> tree) {

        List<Integer> eulerTour = new ArrayList<>();
        Deque<TraversalFrame> stack = new ArrayDeque<>();

        stack.push(new TraversalFrame(0, -1));
        eulerTour.add(0);

        while (!stack.isEmpty()) {

            TraversalFrame frame = stack.peek();
            List<Integer> neighbors = tree.get(frame.node);

            if (frame.nextNeighborIndex < neighbors.size()) {

                int next = neighbors.get(frame.nextNeighborIndex);
                frame.nextNeighborIndex++;

                if (next == frame.parent) {
                    continue;
                }

                // Traverse down the tree edge.
                eulerTour.add(next);
                stack.push(new TraversalFrame(next, frame.node));

            } else {

                stack.pop();

                if (!stack.isEmpty()) {
                    // Traverse back up the tree edge.
                    eulerTour.add(stack.peek().node);
                }
            }
        }

        return eulerTour;
    }

    private void validateDistance(double distance) {
        if (!Double.isFinite(distance) || distance < 0.0) {
            throw new IllegalArgumentException(
                    "Distances must be finite and non-negative.");
        }
    }

    private static class TraversalFrame {

        private final int node;
        private final int parent;
        private int nextNeighborIndex;

        private TraversalFrame(int node, int parent) {
            this.node = node;
            this.parent = parent;
            this.nextNeighborIndex = 0;
        }
    }
}
