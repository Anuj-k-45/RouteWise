package com.routewise.routewise_backend.service;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.Test;

import com.routewise.routewise_backend.model.DeliveryPoint;

class RouteOptimizationTest {

        @Test
        void shouldGenerateAndMeasureOptimalRoute() {

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

                HamiltonianCycleSolver solver = new HamiltonianCycleSolver();

                List<DeliveryPoint> optimizedRoute = solver.solve(
                                points, distanceMatrix);

                RouteDistanceCalculator routeCalculator = new RouteDistanceCalculator();

                double optimizedDistance = routeCalculator.calculateTotalDistance(
                                optimizedRoute, distanceMatrix, points);

                System.out.println("\n--- Held-Karp Optimal TSP Route ---");

                for (DeliveryPoint point : optimizedRoute) {
                        System.out.println(point.getName());
                }

                System.out.printf(
                                "Optimal distance: %.2f km%n",
                                optimizedDistance);

                // A cycle contains every point plus the repeated depot.
                assertEquals(points.size() + 1, optimizedRoute.size());

                // The route must start and end at the depot.
                assertSame(depot, optimizedRoute.get(0));
                assertSame(depot, optimizedRoute.get(optimizedRoute.size() - 1));

                // Every delivery point must appear exactly once between the depots.
                // Every delivery point must appear exactly once in the route.
                assertEquals(points.size() + 1, optimizedRoute.size());

                // The depot appears twice: at the beginning and at the end.
                assertSame(depot, optimizedRoute.get(0));
                assertSame(depot, optimizedRoute.get(optimizedRoute.size() - 1));

                // Every customer must appear exactly once between the depot visits.
                for (DeliveryPoint customer : points.subList(1, points.size())) {
                        long occurrences = optimizedRoute.stream()
                                        .filter(routePoint -> routePoint == customer)
                                        .count();

                        assertEquals(1, occurrences,
                                        "Each customer must appear exactly once: "
                                                        + customer.getName());
                }

                // No unexpected points should be present in the route.
                assertEquals(points.size() + 1, optimizedRoute.size());

                assertTrue(optimizedDistance > 0);
                assertTrue(Double.isFinite(optimizedDistance));
        }
}