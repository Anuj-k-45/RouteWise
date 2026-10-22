package com.routewise.routewise_backend.service;

import com.routewise.routewise_backend.model.DeliveryPoint;
import java.util.List;

public class RouteDistanceCalculator {

    public double calculateTotalDistance(
            List<DeliveryPoint> route,
            DistanceMatrix distanceMatrix,
            List<DeliveryPoint> allPoints) {

        if (route == null || route.size() < 2) {
            return 0.0;
        }

        double totalDistance = 0.0;

        for (int i = 0; i < route.size() - 1; i++) {

            DeliveryPoint current = route.get(i);
            DeliveryPoint next = route.get(i + 1);

            int currentIndex = allPoints.indexOf(current);
            int nextIndex = allPoints.indexOf(next);

            if (currentIndex == -1 || nextIndex == -1) {
                throw new IllegalArgumentException(
                        "Route contains a point missing from allPoints");
            }

            totalDistance += distanceMatrix.getDistance(
                    currentIndex,
                    nextIndex);
        }

        return totalDistance;
    }
}