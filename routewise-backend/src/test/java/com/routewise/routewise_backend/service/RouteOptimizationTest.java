
package com.routewise.routewise_backend.service;

import com.routewise.routewise_backend.model.DeliveryPoint;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RouteOptimizationTest {

        @Test
        void shouldGenerateAndMeasureRoute() {

                DeliveryPoint depot = new DeliveryPoint(
                                "DEPOT", "Warehouse", 22.5726, 88.3639);

                DeliveryPoint customerA = new DeliveryPoint(
                                "A", "Customer A", 22.5867, 88.4171);

                DeliveryPoint customerB = new DeliveryPoint(
                                "B", "Customer B", 22.5448, 88.3426);

                DeliveryPoint customerC = new DeliveryPoint(
                                "C", "Customer C", 22.5900, 88.3500);

                List<DeliveryPoint> points = List.of(
                                depot, customerA, customerB, customerC);

                DistanceCalculator distanceCalculator = new DistanceCalculator();

                DistanceMatrix distanceMatrix = new DistanceMatrix(
                                points, distanceCalculator);

                NearestNeighborSolver nearestNeighborSolver = new NearestNeighborSolver();

                List<DeliveryPoint> initialRoute = nearestNeighborSolver.solve(points, distanceMatrix);

                RouteDistanceCalculator routeCalculator = new RouteDistanceCalculator();

                double initialDistance = routeCalculator.calculateTotalDistance(
                                initialRoute, distanceMatrix, points);

                TwoOptSolver twoOptSolver = new TwoOptSolver();

                List<DeliveryPoint> optimizedRoute = twoOptSolver.improveRoute(
                                initialRoute, distanceMatrix, points);

                double optimizedDistance = routeCalculator.calculateTotalDistance(
                                optimizedRoute, distanceMatrix, points);

                System.out.println("\n--- Nearest Neighbor Result ---");

                for (DeliveryPoint point : initialRoute) {
                        System.out.println(point.getName());
                }

                System.out.printf(
                                "Initial distance: %.2f km%n",
                                initialDistance);

                System.out.println("\n--- 2-opt Result ---");

                for (DeliveryPoint point : optimizedRoute) {
                        System.out.println(point.getName());
                }

                System.out.printf(
                                "Optimized distance: %.2f km%n",
                                optimizedDistance);

                assertEquals(points.size() + 1, initialRoute.size());
                assertEquals(points.size() + 1, optimizedRoute.size());

                assertSame(depot, initialRoute.get(0));
                assertSame(depot, initialRoute.get(initialRoute.size() - 1));

                assertSame(depot, optimizedRoute.get(0));
                assertSame(depot, optimizedRoute.get(optimizedRoute.size() - 1));

                assertTrue(initialDistance > 0);

                assertTrue(
                                optimizedDistance <= initialDistance + 1e-9,
                                "2-opt should not increase the route distance");
        }
}
