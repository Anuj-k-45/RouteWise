package com.routewise.routewise_backend.service;

import com.routewise.routewise_backend.dto.RouteOptimizationRequest;
import com.routewise.routewise_backend.dto.RouteOptimizationResponse;

import com.routewise.routewise_backend.model.DeliveryPoint;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class RouteOptimizationService {

        private final DistanceCalculator distanceCalculator;
        private final NearestNeighborSolver nearestNeighborSolver;
        private final TwoOptSolver twoOptSolver;

        public RouteOptimizationService() {
                this.distanceCalculator = new DistanceCalculator();
                this.nearestNeighborSolver = new NearestNeighborSolver();
                this.twoOptSolver = new TwoOptSolver();
        }

        public RouteOptimizationResponse optimizeRoute(
                        RouteOptimizationRequest request) {

                if (request == null || request.getPoints() == null) {
                        throw new IllegalArgumentException(
                                        "Request and delivery points must not be null.");
                }

                List<DeliveryPoint> points = request.getPoints();

                if (points == null || points.size() < 2) {
                        throw new IllegalArgumentException(
                                        "At least two points are required, including the depot.");
                }

                // Build the distance matrix.
                DistanceMatrix matrix = new DistanceMatrix(points, distanceCalculator);

                RouteDistanceCalculator routeCalculator = new RouteDistanceCalculator();

                // ORIGINAL ROUTE:
                // Preserve the order submitted by the user.
                List<DeliveryPoint> originalRoute = new ArrayList<>(points);

                // Return to the starting depot.
                originalRoute.add(points.get(0));

                double originalDistance = routeCalculator.calculateTotalDistance(
                                originalRoute, matrix, points);

                // CANDIDATE 1:
                // Nearest Neighbor followed by 2-opt.
                List<DeliveryPoint> nearestRoute = nearestNeighborSolver.solve(points, matrix);

                List<DeliveryPoint> nearestOptimized = twoOptSolver.improveRoute(
                                nearestRoute, matrix, points);

                double nearestDistance = routeCalculator.calculateTotalDistance(
                                nearestOptimized, matrix, points);

                // CANDIDATE 2:
                // Improve the user's original ordering using 2-opt.
                List<DeliveryPoint> inputOptimized = twoOptSolver.improveRoute(
                                originalRoute, matrix, points);

                double inputOptimizedDistance = routeCalculator.calculateTotalDistance(
                                inputOptimized, matrix, points);

                // Choose the candidate with the shorter distance.
                List<DeliveryPoint> optimizedRoute;
                double optimizedDistance;

                if (nearestDistance <= inputOptimizedDistance) {
                        optimizedRoute = nearestOptimized;
                        optimizedDistance = nearestDistance;
                } else {
                        optimizedRoute = inputOptimized;
                        optimizedDistance = inputOptimizedDistance;
                }

                // Return original and optimized routes with their distances.
                return new RouteOptimizationResponse(
                                originalRoute,
                                optimizedRoute,
                                originalDistance,
                                optimizedDistance);
        }
}
