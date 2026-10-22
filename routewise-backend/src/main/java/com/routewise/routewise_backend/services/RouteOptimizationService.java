
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
        private final HamiltonianCycleSolver hamiltonianCycleSolver;

        public RouteOptimizationService() {
                this.distanceCalculator = new DistanceCalculator();
                this.hamiltonianCycleSolver = new HamiltonianCycleSolver();
        }

        public RouteOptimizationResponse optimizeRoute(
                        RouteOptimizationRequest request) {

                if (request == null || request.getPoints() == null) {
                        throw new IllegalArgumentException(
                                        "Request and delivery points must not be null.");
                }

                List<DeliveryPoint> points = request.getPoints();

                if (points.size() < 2) {
                        throw new IllegalArgumentException(
                                        "At least two points are required, including the depot.");
                }

                DistanceMatrix matrix = new DistanceMatrix(points, distanceCalculator);

                RouteDistanceCalculator routeCalculator = new RouteDistanceCalculator();

                // Preserve the order submitted by the user.
                List<DeliveryPoint> originalRoute = new ArrayList<>(points);

                // Close the original route by returning to the depot.
                originalRoute.add(points.get(0));

                double originalDistance = routeCalculator.calculateTotalDistance(
                                originalRoute, matrix, points);

                // Find the minimum-distance Hamiltonian cycle.
                List<DeliveryPoint> optimizedRoute = hamiltonianCycleSolver.solve(points, matrix);

                double optimizedDistance = routeCalculator.calculateTotalDistance(
                                optimizedRoute, matrix, points);

                System.out.println("-------------------------------------------------------");
                System.out.println("Using TSP Solver to optimize the route for the given delivery points: ");
                System.out.println("Original Distance: " + originalDistance);
                System.out.println("Optimized Distance: " + optimizedDistance);
                System.out.println("-------------------------------------------------------");

                return new RouteOptimizationResponse(
                                originalRoute,
                                optimizedRoute,
                                originalDistance,
                                optimizedDistance);
        }
}
