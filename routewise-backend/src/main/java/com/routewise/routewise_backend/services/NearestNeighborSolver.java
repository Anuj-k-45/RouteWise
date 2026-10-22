
package com.routewise.routewise_backend.service;

import com.routewise.routewise_backend.model.DeliveryPoint;

import java.util.ArrayList;
import java.util.List;

public class NearestNeighborSolver {

    public List<DeliveryPoint> solve(
            List<DeliveryPoint> points,
            DistanceMatrix distanceMatrix) {

        if (points == null || points.isEmpty()) {
            throw new IllegalArgumentException(
                    "At least one delivery point is required");
        }

        if (distanceMatrix.size() != points.size()) {
            throw new IllegalArgumentException(
                    "Points and distance matrix sizes must match");
        }

        int size = points.size();

        boolean[] visited = new boolean[size];

        List<DeliveryPoint> route = new ArrayList<>();

        int current = 0;

        visited[current] = true;
        route.add(points.get(current));

        for (int count = 1; count < size; count++) {

            int nearest = -1;
            double minimumDistance = Double.MAX_VALUE;

            for (int i = 0; i < size; i++) {

                if (!visited[i]) {

                    double distance = distanceMatrix.getDistance(current, i);

                    if (distance < minimumDistance) {
                        minimumDistance = distance;
                        nearest = i;
                    }
                }
            }

            visited[nearest] = true;

            route.add(points.get(nearest));

            current = nearest;
        }

        // Return to the starting depot.
        route.add(points.get(0));

        return route;
    }
}
