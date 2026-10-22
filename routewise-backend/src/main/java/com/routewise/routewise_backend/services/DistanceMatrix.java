
package com.routewise.routewise_backend.service;

import com.routewise.routewise_backend.model.DeliveryPoint;
import java.util.List;

public class DistanceMatrix {

    private final double[][] matrix;

    public DistanceMatrix(
            List<DeliveryPoint> points,
            DistanceCalculator calculator) {

        int size = points.size();
        matrix = new double[size][size];

        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {

                if (i == j) {
                    matrix[i][j] = 0.0;
                } else {
                    matrix[i][j] = calculator.calculateDistance(
                            points.get(i),
                            points.get(j));
                }
            }
        }
    }

    public double getDistance(int from, int to) {
        return matrix[from][to];
    }

    public int size() {
        return matrix.length;
    }
}
