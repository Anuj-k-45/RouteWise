
package com.routewise.routewise_backend.service;

import com.routewise.routewise_backend.model.DeliveryPoint;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class TwoOptSolver {

    public List<DeliveryPoint> improveRoute(
            List<DeliveryPoint> initialRoute,
            DistanceMatrix distanceMatrix,
            List<DeliveryPoint> allPoints) {

        if (initialRoute == null || initialRoute.size() < 4) {
            return new ArrayList<>(
                    initialRoute == null ? List.of() : initialRoute);
        }

        List<DeliveryPoint> bestRoute = new ArrayList<>(initialRoute);

        RouteDistanceCalculator calculator = new RouteDistanceCalculator();

        double bestDistance = calculator.calculateTotalDistance(
                bestRoute, distanceMatrix, allPoints);

        boolean improved = true;

        while (improved) {
            improved = false;

            for (int i = 1; i < bestRoute.size() - 2; i++) {

                for (int j = i + 1; j < bestRoute.size() - 1; j++) {

                    List<DeliveryPoint> candidate = new ArrayList<>(bestRoute);

                    Collections.reverse(
                            candidate.subList(i, j + 1));

                    double candidateDistance = calculator.calculateTotalDistance(
                            candidate,
                            distanceMatrix,
                            allPoints);

                    if (candidateDistance < bestDistance - 1e-9) {
                        bestRoute = candidate;
                        bestDistance = candidateDistance;
                        improved = true;
                    }
                }
            }
        }

        return bestRoute;
    }
}
